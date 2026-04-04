"""
Approach 2: PINN with PACMANN using Adam optimizer for collocation point movement
==================================================================================
Solves the convection-diffusion equation:
    u_t + beta * u_x - eps * u_xx = f(x, t)

Same PINN architecture as Approach 1, but the PACMANN collocation point
movement uses a manually-implemented Adam optimizer (instead of plain
gradient ascent).  Points are moved to maximize the sum of squared PDE
residuals, following the update rule:

    V_{i+1} = beta1 * V_i + (1 - beta1) * grad
    S_{i+1} = beta2 * S_i + (1 - beta2) * grad^2
    V_hat   = V / (1 - beta1^{i+1})
    S_hat   = S / (1 - beta2^{i+1})
    x_{i+1} = x_i + s * V_hat / (sqrt(S_hat) + eps_adam)

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
#  Neural Network
# ---------------------------------------------------------------------------

class PINN(nn.Module):
    """Feedforward network: 2 inputs (x, t) -> 1 output (u_hat)."""

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
        xt : Tensor of shape (N, 2)  -- columns are [x, t].

        Returns
        -------
        Tensor of shape (N, 1).
        """
        return self.net(xt)


# ---------------------------------------------------------------------------
#  PDE residual
# ---------------------------------------------------------------------------

def pde_residual(model, x, t, beta, eps, source_fn):
    """
    Compute the PDE residual  r = u_t + beta u_x - eps u_xx - f.

    x, t must have requires_grad=True.
    Returns r of shape (N, 1).
    """
    xt = torch.cat([x, t], dim=1)
    u = model(xt)

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
#  Sampling helpers
# ---------------------------------------------------------------------------

def sample_interior(N, x_lo, x_hi, t_lo, t_hi):
    """Uniformly sample N interior collocation points."""
    x = torch.rand(N, 1) * (x_hi - x_lo) + x_lo
    t = torch.rand(N, 1) * (t_hi - t_lo) + t_lo
    return x, t


def sample_ic(N, x_lo, x_hi, t0=0.0):
    """Sample N initial-condition points at t = t0."""
    x = torch.rand(N, 1) * (x_hi - x_lo) + x_lo
    t = torch.full((N, 1), t0)
    return x, t


def sample_bc(N, x_lo, x_hi, t_lo, t_hi):
    """Sample N boundary-condition points (N/2 at each x boundary)."""
    n_half = N // 2
    # Left boundary
    x_left = torch.full((n_half, 1), x_lo)
    t_left = torch.rand(n_half, 1) * (t_hi - t_lo) + t_lo
    # Right boundary
    x_right = torch.full((N - n_half, 1), x_hi)
    t_right = torch.rand(N - n_half, 1) * (t_hi - t_lo) + t_lo
    x = torch.cat([x_left, x_right], dim=0)
    t = torch.cat([t_left, t_right], dim=0)
    return x, t


# ---------------------------------------------------------------------------
#  PACMANN: Adam-based point movement
# ---------------------------------------------------------------------------

def pacmann_adam_move(model, x_r, t_r, beta, eps, source_fn,
                     x_lo, x_hi, t_lo, t_hi,
                     step_size=0.001, num_steps=5,
                     beta1=0.9, beta2=0.999, eps_adam=1e-8):
    """
    Move collocation points toward regions of higher squared residual
    using manually-implemented Adam on the point coordinates.

    The objective is to MAXIMIZE sum(r^2), so the update adds
    (gradient ascent direction) using Adam moment estimates.

    Points that leave the domain are resampled uniformly.

    Parameters
    ----------
    model : PINN
        Network (frozen during point movement).
    x_r, t_r : Tensor (N, 1)
        Current collocation point coordinates.
    beta, eps : float
        PDE parameters.
    source_fn : callable
        Source term function.
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

    Returns
    -------
    x_new, t_new : Tensor (N, 1)
        Moved collocation points.
    """
    model.eval()

    # Detach from any existing graph and make leaf tensors
    x_pts = x_r.detach().clone()
    t_pts = t_r.detach().clone()

    N = x_pts.shape[0]

    # Initialize Adam moment buffers (for both x and t coordinates)
    V_x = torch.zeros_like(x_pts)
    V_t = torch.zeros_like(t_pts)
    S_x = torch.zeros_like(x_pts)
    S_t = torch.zeros_like(t_pts)

    for step in range(1, num_steps + 1):
        # Enable gradients for this step
        x_pts = x_pts.detach().requires_grad_(True)
        t_pts = t_pts.detach().requires_grad_(True)

        # Compute squared residual sum (objective to maximize)
        r = pde_residual(model, x_pts, t_pts, beta, eps, source_fn)
        loss_pts = (r ** 2).sum()

        # Gradient of sum(r^2) w.r.t. point locations
        grad_x, grad_t = torch.autograd.grad(
            loss_pts, [x_pts, t_pts], retain_graph=False
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

    model.train()
    return x_pts.detach(), t_pts.detach()


# ---------------------------------------------------------------------------
#  Training loop
# ---------------------------------------------------------------------------

def train(example, beta, eps, save_dir,
          epochs=10000, lr=1e-3,
          N_r=2000, N_ic=200, N_bc=200,
          lam_r=1.0, lam_ic=10.0, lam_bc=10.0,
          pacmann_period=500, pacmann_steps=5, pacmann_lr=0.001,
          adam_beta1=0.9, adam_beta2=0.999, adam_eps=1e-8,
          device="cpu"):
    """
    Train the PINN for one example problem.

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
    N_r, N_ic, N_bc : int
        Number of collocation / IC / BC points.
    lam_r, lam_ic, lam_bc : float
        Loss weights for residual, initial condition, boundary condition.
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
        ic_fn = lambda x: torch.sin(np.pi * x)
        bc_val = 0.0
    elif example == 2:
        x_lo, x_hi = 0.0, 1.0
        source_fn = source_term_ex2_torch
        # IC: u(x,0) = q(x) = x - (exp((x-1)/eps) - exp(-1/eps))/(1 - exp(-1/eps))
        exp_ratio = np.exp(-1.0 / eps)

        def ic_fn(x):
            return x - (torch.exp((x - 1.0) / eps) - exp_ratio) / (1.0 - exp_ratio)

        bc_val = 0.0  # u(0,t)=0, u(1,t)=0
    else:
        raise ValueError("example must be 1 or 2")

    t_lo, t_hi = 0.0, 1.0

    # Build model
    model = PINN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    # Initial collocation points
    x_r, t_r = sample_interior(N_r, x_lo, x_hi, t_lo, t_hi)
    x_ic, t_ic = sample_ic(N_ic, x_lo, x_hi, t0=t_lo)
    x_bc, t_bc = sample_bc(N_bc, x_lo, x_hi, t_lo, t_hi)

    # Move to device
    x_r, t_r = x_r.to(device), t_r.to(device)
    x_ic, t_ic = x_ic.to(device), t_ic.to(device)
    x_bc, t_bc = x_bc.to(device), t_bc.to(device)

    print(f"\n{'='*60}")
    print(f"  Training Example {example}  (beta={beta}, eps={eps})")
    print(f"  Approach 2: PACMANN with Adam-based point movement")
    print(f"{'='*60}")

    for epoch in range(1, epochs + 1):

        # ---- PACMANN Adam-based point movement ----
        if epoch > 1 and (epoch - 1) % pacmann_period == 0:
            x_r, t_r = pacmann_adam_move(
                model, x_r, t_r, beta, eps, source_fn,
                x_lo, x_hi, t_lo, t_hi,
                step_size=pacmann_lr, num_steps=pacmann_steps,
                beta1=adam_beta1, beta2=adam_beta2, eps_adam=adam_eps,
            )

        model.train()
        optimizer.zero_grad()

        # --- Interior (PDE) loss ---
        x_r_g = x_r.clone().requires_grad_(True)
        t_r_g = t_r.clone().requires_grad_(True)
        r = pde_residual(model, x_r_g, t_r_g, beta, eps, source_fn)
        loss_r = (r ** 2).mean()

        # --- Initial condition loss ---
        xt_ic = torch.cat([x_ic, t_ic], dim=1)
        u_ic_pred = model(xt_ic)
        u_ic_true = ic_fn(x_ic)
        loss_ic = ((u_ic_pred - u_ic_true) ** 2).mean()

        # --- Boundary condition loss ---
        xt_bc = torch.cat([x_bc, t_bc], dim=1)
        u_bc_pred = model(xt_bc)
        loss_bc = ((u_bc_pred - bc_val) ** 2).mean()

        # --- Total loss ---
        loss = lam_r * loss_r + lam_ic * loss_ic + lam_bc * loss_bc
        loss.backward()
        optimizer.step()

        if epoch % 1000 == 0 or epoch == 1:
            print(
                f"  Epoch {epoch:5d}/{epochs} | "
                f"Loss {loss.item():.4e}  "
                f"(r={loss_r.item():.3e}, ic={loss_ic.item():.3e}, bc={loss_bc.item():.3e})"
            )

    # ---- Evaluation ----
    results = eval_solution(model, example, beta, eps, device=device)
    label = f"Approach2_Ex{example}_beta{beta}_eps{eps}"
    print_metrics(results, label)
    plot_results(results, label, save_dir=save_dir)
    plot_time_slices(results, label=label, save_dir=save_dir)

    return model, results


# ---------------------------------------------------------------------------
#  Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    device = "cpu"
    save_dir = Path("/Users/christianloan/Agent/math-fun/results/approach2")
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
