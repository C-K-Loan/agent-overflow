"""
Approach 3: Hard-Constrained PINN + Limited Residual Loss + PACMANN (Adam)
==========================================================================
Solves the convection-diffusion equation:
    u_t + beta * u_x - eps * u_xx = f(x, t)

Key design decisions:
  1) Hard-constrained BCs/IC via a solution ansatz -- no BC or IC loss needed.
     Example 1: u_theta = (1 - x^2) * t * NN(x,t) + (1 - t) * sin(pi x)
     Example 2: u_theta = x*(1-x) * t * NN(x,t) + (1 - t) * h(x, eps)
  2) Limited residual loss: xi(s) = 0.5*s^4 - s^3 - 0.5*s^2 + 2*s for s<=1, else 1.
     L_lr = sum_i xi( |Omega| / (N_r * t0) * r_i^2 )
  3) PACMANN with Adam-based point movement using monitor M(x) = xi(r^2 / t0).
  4) Architecture: 4 hidden layers, 64 neurons, tanh activation.
  5) A HardConstraintModel wrapper applies the ansatz in forward() for
     compatibility with eval_solution.

Two benchmark examples:
  Example 1: domain [-1,1] x [0,1], exact u = e^{-t} sin(pi x)
  Example 2: domain [0,1] x [0,1], exact u = e^{-t} q(x) with boundary layer
"""

import torch
import torch.nn as nn
import numpy as np
from pathlib import Path

from eval_solution import (
    source_term_ex1_torch,
    source_term_ex2_torch,
    eval_solution,
    print_metrics,
    plot_results,
    plot_time_slices,
)


# ---------------------------------------------------------------------------
#  Neural Network (raw output -- no ansatz applied here)
# ---------------------------------------------------------------------------

class RawPINN(nn.Module):
    """Feedforward network: 2 inputs (x, t) -> 1 output (raw NN value)."""

    def __init__(self, hidden_dim=64, num_hidden=4):
        super().__init__()
        layers = [nn.Linear(2, hidden_dim), nn.Tanh()]
        for _ in range(num_hidden - 1):
            layers += [nn.Linear(hidden_dim, hidden_dim), nn.Tanh()]
        layers.append(nn.Linear(hidden_dim, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, xt):
        """
        Parameters
        ----------
        xt : Tensor of shape (N, 2) -- columns are [x, t].

        Returns
        -------
        Tensor of shape (N, 1) -- raw network output (before ansatz).
        """
        return self.net(xt)


# ---------------------------------------------------------------------------
#  Hard-Constraint Wrapper (applies ansatz in forward for eval compatibility)
# ---------------------------------------------------------------------------

class HardConstraintModel(nn.Module):
    """
    Wraps a RawPINN and applies the hard-constraint ansatz so that the
    boundary and initial conditions are exactly satisfied.

    For Example 1 (domain [-1,1] x [0,1]):
        u_theta(x,t) = (1 - x^2) * t * NN(x,t) + (1 - t) * sin(pi x)

    For Example 2 (domain [0,1] x [0,1]):
        u_theta(x,t) = x * (1 - x) * t * NN(x,t) + (1 - t) * h(x, eps)
    where h(x, eps) = x - (exp((x-1)/eps) - exp(-1/eps)) / (1 - exp(-1/eps)).
    """

    def __init__(self, raw_model, example, eps=None):
        super().__init__()
        self.raw_model = raw_model
        self.example = example
        self.eps = eps

    def forward(self, xt):
        """
        Parameters
        ----------
        xt : Tensor of shape (N, 2) -- columns are [x, t].

        Returns
        -------
        Tensor of shape (N, 1) -- u_theta with hard constraints applied.
        """
        x = xt[:, 0:1]
        t = xt[:, 1:2]
        nn_out = self.raw_model(xt)

        if self.example == 1:
            # u_theta = (1 - x^2) * t * NN + (1 - t) * sin(pi x)
            u = (1.0 - x ** 2) * t * nn_out + (1.0 - t) * torch.sin(np.pi * x)
        elif self.example == 2:
            # h(x, eps) = x - (exp((x-1)/eps) - exp(-1/eps)) / (1 - exp(-1/eps))
            eps_val = self.eps
            exp_ratio = np.exp(-1.0 / eps_val)
            h = x - (torch.exp((x - 1.0) / eps_val) - exp_ratio) / (1.0 - exp_ratio)
            u = x * (1.0 - x) * t * nn_out + (1.0 - t) * h
        else:
            raise ValueError("example must be 1 or 2")

        return u


# ---------------------------------------------------------------------------
#  Hard-constraint ansatz (standalone function for training with autograd)
# ---------------------------------------------------------------------------

def apply_ansatz(raw_model, x, t, example, eps):
    """
    Apply the hard-constraint ansatz to the raw network output.

    x, t must have requires_grad=True for PDE residual computation.
    Returns u_theta of shape (N, 1).
    """
    xt = torch.cat([x, t], dim=1)
    nn_out = raw_model(xt)

    if example == 1:
        u = (1.0 - x ** 2) * t * nn_out + (1.0 - t) * torch.sin(np.pi * x)
    elif example == 2:
        exp_ratio = np.exp(-1.0 / eps)
        h = x - (torch.exp((x - 1.0) / eps) - exp_ratio) / (1.0 - exp_ratio)
        u = x * (1.0 - x) * t * nn_out + (1.0 - t) * h
    else:
        raise ValueError("example must be 1 or 2")

    return u


# ---------------------------------------------------------------------------
#  PDE residual (using hard-constraint ansatz)
# ---------------------------------------------------------------------------

def pde_residual(raw_model, x, t, beta, eps, source_fn, example):
    """
    Compute the PDE residual r = u_t + beta u_x - eps u_xx - f.

    x, t must have requires_grad=True.
    Returns r of shape (N, 1).
    """
    u = apply_ansatz(raw_model, x, t, example, eps)

    # First-order derivatives
    grads = torch.autograd.grad(
        u, [x, t], grad_outputs=torch.ones_like(u), create_graph=True
    )
    u_x = grads[0]
    u_t = grads[1]

    # Second-order derivative u_xx
    u_xx = torch.autograd.grad(
        u_x, x, grad_outputs=torch.ones_like(u_x), create_graph=True
    )[0]

    f = source_fn(x, t, beta, eps)
    residual = u_t + beta * u_x - eps * u_xx - f
    return residual


# ---------------------------------------------------------------------------
#  Limited residual loss function
# ---------------------------------------------------------------------------

def xi_limiter(s):
    """
    Limiter function:
        xi(s) = 0.5*s^4 - s^3 - 0.5*s^2 + 2*s   for s <= 1
        xi(s) = 1                                   for s > 1
    """
    xi_poly = 0.5 * s ** 4 - s ** 3 - 0.5 * s ** 2 + 2.0 * s
    return torch.where(s <= 1.0, xi_poly, torch.ones_like(s))


def limited_residual_loss(residuals, domain_area, N_r, t0=1.0):
    """
    Compute the limited residual loss:
        L_lr = sum_i xi( |Omega| / (N_r * t0) * r_i^2 )

    Parameters
    ----------
    residuals : Tensor of shape (N, 1)
        PDE residuals.
    domain_area : float
        Area of the spatial-temporal domain |Omega|.
    N_r : int
        Number of residual collocation points.
    t0 : float
        Scaling parameter.

    Returns
    -------
    Scalar tensor.
    """
    r_sq = residuals ** 2
    s = (domain_area / (N_r * t0)) * r_sq
    return xi_limiter(s).sum()


# ---------------------------------------------------------------------------
#  Monitor function for PACMANN
# ---------------------------------------------------------------------------

def monitor_function(residuals, t0=1.0):
    """
    Monitor function M_theta(x) = xi(r^2 / t0).

    Parameters
    ----------
    residuals : Tensor of shape (N, 1)
        PDE residuals.
    t0 : float
        Scaling parameter.

    Returns
    -------
    Tensor of shape (N, 1).
    """
    r_sq = residuals ** 2
    s = r_sq / t0
    return xi_limiter(s)


# ---------------------------------------------------------------------------
#  Sampling helpers
# ---------------------------------------------------------------------------

def sample_interior(N, x_lo, x_hi, t_lo, t_hi):
    """Uniformly sample N interior collocation points."""
    x = torch.rand(N, 1) * (x_hi - x_lo) + x_lo
    t = torch.rand(N, 1) * (t_hi - t_lo) + t_lo
    return x, t


# ---------------------------------------------------------------------------
#  PACMANN: Adam-based point movement with monitor function
# ---------------------------------------------------------------------------

def pacmann_adam_move(raw_model, x_r, t_r, beta, eps, source_fn, example,
                     x_lo, x_hi, t_lo, t_hi,
                     step_size=0.001, num_steps=5,
                     beta1=0.9, beta2=0.999, eps_adam=1e-8, t0=1.0):
    """
    Move collocation points toward regions of higher monitor function
    M_theta = xi(r^2 / t0) using manually-implemented Adam on point coords.

    The objective is to MAXIMIZE sum(M_theta), so the update uses
    gradient ascent.

    Points that leave the domain are resampled uniformly.

    Parameters
    ----------
    raw_model : RawPINN
        Raw network (frozen during point movement).
    x_r, t_r : Tensor (N, 1)
        Current collocation point coordinates.
    beta, eps : float
        PDE parameters.
    source_fn : callable
        Source term function.
    example : int
        1 or 2.
    x_lo, x_hi, t_lo, t_hi : float
        Domain bounds.
    step_size : float
        Adam step size s.
    num_steps : int
        Number of Adam steps (T).
    beta1, beta2 : float
        Adam exponential decay rates for moment estimates.
    eps_adam : float
        Adam epsilon for numerical stability.
    t0 : float
        Scaling parameter for monitor function.

    Returns
    -------
    x_new, t_new : Tensor (N, 1)
        Moved collocation points.
    """
    raw_model.eval()

    # Detach from any existing graph and make leaf tensors
    x_pts = x_r.detach().clone()
    t_pts = t_r.detach().clone()

    # Initialize Adam moment buffers
    V_x = torch.zeros_like(x_pts)
    V_t = torch.zeros_like(t_pts)
    S_x = torch.zeros_like(x_pts)
    S_t = torch.zeros_like(t_pts)

    for step in range(1, num_steps + 1):
        # Enable gradients for this step
        x_pts = x_pts.detach().requires_grad_(True)
        t_pts = t_pts.detach().requires_grad_(True)

        # Compute monitor function (objective to maximize)
        r = pde_residual(raw_model, x_pts, t_pts, beta, eps, source_fn, example)
        M = monitor_function(r, t0=t0)
        obj = M.sum()

        # Gradient w.r.t. point locations
        grad_x, grad_t = torch.autograd.grad(
            obj, [x_pts, t_pts], retain_graph=False
        )

        with torch.no_grad():
            # Update first moment estimates
            V_x = beta1 * V_x + (1.0 - beta1) * grad_x
            V_t = beta1 * V_t + (1.0 - beta1) * grad_t

            # Update second moment estimates
            S_x = beta2 * S_x + (1.0 - beta2) * (grad_x ** 2)
            S_t = beta2 * S_t + (1.0 - beta2) * (grad_t ** 2)

            # Bias-corrected estimates
            V_x_hat = V_x / (1.0 - beta1 ** step)
            V_t_hat = V_t / (1.0 - beta1 ** step)
            S_x_hat = S_x / (1.0 - beta2 ** step)
            S_t_hat = S_t / (1.0 - beta2 ** step)

            # Adam update (gradient ascent: + instead of -)
            x_pts = x_pts + step_size * V_x_hat / (torch.sqrt(S_x_hat) + eps_adam)
            t_pts = t_pts + step_size * V_t_hat / (torch.sqrt(S_t_hat) + eps_adam)

            # Resample out-of-domain points
            oob = (
                (x_pts < x_lo) | (x_pts > x_hi) |
                (t_pts < t_lo) | (t_pts > t_hi)
            ).squeeze(-1)
            n_oob = oob.sum().item()
            if n_oob > 0:
                x_pts[oob] = torch.rand(n_oob, 1) * (x_hi - x_lo) + x_lo
                t_pts[oob] = torch.rand(n_oob, 1) * (t_hi - t_lo) + t_lo
                # Reset Adam states for resampled points
                V_x[oob] = 0.0
                V_t[oob] = 0.0
                S_x[oob] = 0.0
                S_t[oob] = 0.0

    raw_model.train()
    return x_pts.detach(), t_pts.detach()


# ---------------------------------------------------------------------------
#  Training loop
# ---------------------------------------------------------------------------

def train(example, beta, eps, save_dir,
          epochs=10000, lr=1e-3,
          N_r=2000, t0=1.0,
          pacmann_period=500, pacmann_steps=5, pacmann_lr=0.001,
          adam_beta1=0.9, adam_beta2=0.999, adam_eps=1e-8,
          device="cpu"):
    """
    Train the hard-constrained PINN with limited residual loss and PACMANN.

    Parameters
    ----------
    example : int
        1 or 2.
    beta, eps : float
        PDE parameters.
    save_dir : str or Path
        Where to save plots.
    epochs : int
        Total training iterations.
    lr : float
        Learning rate for the network Adam optimizer.
    N_r : int
        Number of interior collocation points.
    t0 : float
        Scaling parameter for limited residual loss and monitor function.
    pacmann_period : int
        How often (in epochs) to perform PACMANN point movement.
    pacmann_steps : int
        Number of Adam steps per PACMANN cycle (T).
    pacmann_lr : float
        Step size (s) for Adam-based point movement.
    adam_beta1, adam_beta2 : float
        Adam hyperparameters for point movement.
    adam_eps : float
        Adam epsilon for point movement.
    device : str
        Torch device.
    """
    # Domain bounds
    if example == 1:
        x_lo, x_hi = -1.0, 1.0
        source_fn = source_term_ex1_torch
        domain_area = (x_hi - x_lo) * 1.0  # 2.0
    elif example == 2:
        x_lo, x_hi = 0.0, 1.0
        source_fn = source_term_ex2_torch
        domain_area = (x_hi - x_lo) * 1.0  # 1.0
    else:
        raise ValueError("example must be 1 or 2")

    t_lo, t_hi = 0.0, 1.0

    # Build raw model
    raw_model = RawPINN().to(device)
    optimizer = torch.optim.Adam(raw_model.parameters(), lr=lr)

    # Initial collocation points
    x_r, t_r = sample_interior(N_r, x_lo, x_hi, t_lo, t_hi)
    x_r, t_r = x_r.to(device), t_r.to(device)

    print(f"\n{'='*60}")
    print(f"  Training Example {example}  (beta={beta}, eps={eps})")
    print(f"  Approach 3: Hard-Constrained + Limited Residual + PACMANN")
    print(f"{'='*60}")

    for epoch in range(1, epochs + 1):

        # ---- PACMANN Adam-based point movement ----
        if epoch > 1 and (epoch - 1) % pacmann_period == 0:
            x_r, t_r = pacmann_adam_move(
                raw_model, x_r, t_r, beta, eps, source_fn, example,
                x_lo, x_hi, t_lo, t_hi,
                step_size=pacmann_lr, num_steps=pacmann_steps,
                beta1=adam_beta1, beta2=adam_beta2, eps_adam=adam_eps, t0=t0,
            )

        raw_model.train()
        optimizer.zero_grad()

        # --- Interior (PDE) residual ---
        x_r_g = x_r.clone().requires_grad_(True)
        t_r_g = t_r.clone().requires_grad_(True)
        r = pde_residual(raw_model, x_r_g, t_r_g, beta, eps, source_fn, example)

        # --- Limited residual loss (only loss term needed) ---
        loss = limited_residual_loss(r, domain_area, N_r, t0=t0)

        loss.backward()
        optimizer.step()

        if epoch % 1000 == 0 or epoch == 1:
            mse_r = (r ** 2).mean().item()
            print(
                f"  Epoch {epoch:5d}/{epochs} | "
                f"L_lr {loss.item():.4e}  "
                f"(MSE_r={mse_r:.3e})"
            )

    # ---- Build wrapped model for evaluation ----
    hc_model = HardConstraintModel(raw_model, example, eps=eps).to(device)

    # ---- Evaluation ----
    results = eval_solution(hc_model, example, beta, eps, device=device)
    label = f"Approach3_Ex{example}_beta{beta}_eps{eps}"
    print_metrics(results, label)
    plot_results(results, label, save_dir=save_dir)
    plot_time_slices(results, label=label, save_dir=save_dir)

    return hc_model, results


# ---------------------------------------------------------------------------
#  Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    device = "cpu"
    save_dir = Path("/Users/christianloan/Agent/math-fun/results/approach3")
    save_dir.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(42)
    np.random.seed(42)

    # Example 1
    model1, res1 = train(
        example=1, beta=1.0, eps=0.01,
        save_dir=str(save_dir), device=device,
    )

    # Example 2
    model2, res2 = train(
        example=2, beta=1.0, eps=0.01,
        save_dir=str(save_dir), device=device,
    )

    print("\nDone. Plots saved to:", save_dir)
