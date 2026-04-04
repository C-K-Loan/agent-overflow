"""
Evaluation utilities for convection-diffusion PINN solvers.

Provides exact solutions, source terms, and evaluation metrics
for the two benchmark problems from the PACMANN paper.
"""

import numpy as np
import torch
import matplotlib.pyplot as plt
from pathlib import Path


# ---------------------------------------------------------------------------
#  Example 1:  domain [-1,1] x [0,1]
#    u(x,t) = e^{-t} sin(pi x)
# ---------------------------------------------------------------------------

def exact_solution_ex1(x, t):
    """Exact solution for Example 1 (numpy arrays)."""
    return np.exp(-t) * np.sin(np.pi * x)


def source_term_ex1(x, t, beta, eps):
    """Source f(x,t) for Example 1 (numpy arrays)."""
    return (
        -np.exp(-t) * np.sin(np.pi * x)
        + beta * np.pi * np.exp(-t) * np.cos(np.pi * x)
        + eps * np.pi**2 * np.exp(-t) * np.sin(np.pi * x)
    )


def exact_solution_ex1_torch(x, t):
    """Exact solution for Example 1 (torch tensors)."""
    return torch.exp(-t) * torch.sin(np.pi * x)


def source_term_ex1_torch(x, t, beta, eps):
    """Source f(x,t) for Example 1 (torch tensors)."""
    return (
        -torch.exp(-t) * torch.sin(np.pi * x)
        + beta * np.pi * torch.exp(-t) * torch.cos(np.pi * x)
        + eps * np.pi**2 * torch.exp(-t) * torch.sin(np.pi * x)
    )


# ---------------------------------------------------------------------------
#  Example 2:  domain [0,1] x [0,1]
#    u(x,t) = e^{-t} q(x)   with boundary layer near x = 1
# ---------------------------------------------------------------------------

def _q(x, eps):
    """q(x) helper (numpy)."""
    exp_ratio = np.exp(-1.0 / eps)
    return x - (np.exp((x - 1.0) / eps) - exp_ratio) / (1.0 - exp_ratio)


def _q_prime(x, eps):
    exp_ratio = np.exp(-1.0 / eps)
    return 1.0 - np.exp((x - 1.0) / eps) / (eps * (1.0 - exp_ratio))


def _q_double_prime(x, eps):
    exp_ratio = np.exp(-1.0 / eps)
    return -np.exp((x - 1.0) / eps) / (eps**2 * (1.0 - exp_ratio))


def exact_solution_ex2(x, t, eps):
    """Exact solution for Example 2 (numpy)."""
    return np.exp(-t) * _q(x, eps)


def source_term_ex2(x, t, beta, eps):
    """Source f(x,t) for Example 2 (numpy)."""
    return np.exp(-t) * (
        -_q(x, eps) + beta * _q_prime(x, eps) - eps * _q_double_prime(x, eps)
    )


def _q_torch(x, eps):
    """q(x) helper (torch)."""
    exp_ratio = torch.exp(torch.tensor(-1.0 / eps))
    return x - (torch.exp((x - 1.0) / eps) - exp_ratio) / (1.0 - exp_ratio)


def _q_prime_torch(x, eps):
    exp_ratio = torch.exp(torch.tensor(-1.0 / eps))
    return 1.0 - torch.exp((x - 1.0) / eps) / (eps * (1.0 - exp_ratio))


def _q_double_prime_torch(x, eps):
    exp_ratio = torch.exp(torch.tensor(-1.0 / eps))
    return -torch.exp((x - 1.0) / eps) / (eps**2 * (1.0 - exp_ratio))


def exact_solution_ex2_torch(x, t, eps):
    """Exact solution for Example 2 (torch)."""
    return torch.exp(-t) * _q_torch(x, eps)


def source_term_ex2_torch(x, t, beta, eps):
    """Source f(x,t) for Example 2 (torch)."""
    return torch.exp(-t) * (
        -_q_torch(x, eps)
        + beta * _q_prime_torch(x, eps)
        - eps * _q_double_prime_torch(x, eps)
    )


# ---------------------------------------------------------------------------
#  Evaluation
# ---------------------------------------------------------------------------

def eval_solution(model, example, beta, eps, nx=201, nt=101, device="cpu"):
    """
    Evaluate a trained PINN model against the exact solution.

    Parameters
    ----------
    model : nn.Module
        PINN that takes (x, t) columns and returns û.
    example : int
        1 or 2 — which benchmark problem.
    beta, eps : float
        Convection velocity and diffusion coefficient.
    nx, nt : int
        Number of evaluation grid points in x and t.
    device : str
        Torch device.

    Returns
    -------
    dict with keys:
        x, t       — 1-D numpy arrays of grid coordinates
        X, T       — 2-D meshgrid arrays  (nt × nx)
        u_exact    — exact solution on the grid  (nt × nx)
        u_pred     — network prediction on the grid  (nt × nx)
        abs_err    — pointwise absolute error  (nt × nx)
        l2_rel     — relative L2 error  (scalar)
        linf       — L-infinity error  (scalar)
        mse        — mean squared error  (scalar)
        rmse       — root mean squared error  (scalar)
    """
    if example == 1:
        x_np = np.linspace(-1, 1, nx)
        exact_fn = exact_solution_ex1
    elif example == 2:
        x_np = np.linspace(0, 1, nx)
        exact_fn = lambda x, t: exact_solution_ex2(x, t, eps)
    else:
        raise ValueError("example must be 1 or 2")

    t_np = np.linspace(0, 1, nt)
    X, T = np.meshgrid(x_np, t_np)  # shape (nt, nx)

    u_exact = exact_fn(X, T)

    # Flatten for network input — detect model dtype
    try:
        dtype = next(model.parameters()).dtype
    except StopIteration:
        dtype = torch.float32
    x_flat = torch.tensor(X.ravel(), dtype=dtype, device=device).unsqueeze(1)
    t_flat = torch.tensor(T.ravel(), dtype=dtype, device=device).unsqueeze(1)

    model.eval()
    with torch.no_grad():
        u_pred_flat = model(torch.cat([x_flat, t_flat], dim=1)).cpu().numpy().ravel()

    u_pred = u_pred_flat.reshape(X.shape)
    abs_err = np.abs(u_exact - u_pred)

    l2_rel = np.linalg.norm(u_exact - u_pred) / (np.linalg.norm(u_exact) + 1e-16)
    linf = np.max(abs_err)
    mse = np.mean((u_exact - u_pred) ** 2)
    rmse = np.sqrt(mse)

    return dict(
        x=x_np, t=t_np, X=X, T=T,
        u_exact=u_exact, u_pred=u_pred, abs_err=abs_err,
        l2_rel=l2_rel, linf=linf, mse=mse, rmse=rmse,
    )


def print_metrics(results, label=""):
    """Print a compact summary of evaluation metrics."""
    tag = f" [{label}]" if label else ""
    print(f"--- Evaluation{tag} ---")
    print(f"  Relative L2 error : {results['l2_rel']:.6e}")
    print(f"  L-inf error       : {results['linf']:.6e}")
    print(f"  MSE               : {results['mse']:.6e}")
    print(f"  RMSE              : {results['rmse']:.6e}")


def plot_results(results, label="", save_dir=None):
    """
    Plot exact solution, prediction, and absolute error side by side.
    Optionally save to *save_dir*.
    """
    X, T = results["X"], results["T"]
    fig, axes = plt.subplots(1, 3, figsize=(16, 4))

    kw = dict(cmap="viridis", shading="auto")
    c0 = axes[0].pcolormesh(X, T, results["u_exact"], **kw)
    axes[0].set_title("Exact solution")
    plt.colorbar(c0, ax=axes[0])

    c1 = axes[1].pcolormesh(X, T, results["u_pred"], **kw)
    axes[1].set_title("PINN prediction")
    plt.colorbar(c1, ax=axes[1])

    c2 = axes[2].pcolormesh(X, T, results["abs_err"], cmap="hot", shading="auto")
    axes[2].set_title("Absolute error")
    plt.colorbar(c2, ax=axes[2])

    for ax in axes:
        ax.set_xlabel("x")
        ax.set_ylabel("t")

    title = label if label else "Convection-Diffusion PINN"
    fig.suptitle(f"{title}  |  rel L2 = {results['l2_rel']:.4e}", fontsize=13)
    plt.tight_layout()

    if save_dir:
        Path(save_dir).mkdir(parents=True, exist_ok=True)
        safe = label.replace(" ", "_").replace("/", "_") if label else "result"
        fig.savefig(Path(save_dir) / f"{safe}.png", dpi=150)
    plt.close(fig)


def plot_time_slices(results, times=(0.0, 0.25, 0.5, 0.75, 1.0),
                     label="", save_dir=None):
    """Plot exact vs predicted at selected time slices."""
    x = results["x"]
    t_arr = results["t"]
    fig, axes = plt.subplots(1, len(times), figsize=(4 * len(times), 3.5))
    if len(times) == 1:
        axes = [axes]

    for ax, t_val in zip(axes, times):
        idx = np.argmin(np.abs(t_arr - t_val))
        ax.plot(x, results["u_exact"][idx], "k-", lw=2, label="exact")
        ax.plot(x, results["u_pred"][idx], "r--", lw=1.5, label="pred")
        ax.set_title(f"t = {t_arr[idx]:.2f}")
        ax.set_xlabel("x")
        ax.legend(fontsize=8)

    title = label if label else "Time slices"
    fig.suptitle(title, fontsize=13)
    plt.tight_layout()

    if save_dir:
        Path(save_dir).mkdir(parents=True, exist_ok=True)
        safe = label.replace(" ", "_").replace("/", "_") if label else "slices"
        fig.savefig(Path(save_dir) / f"{safe}_slices.png", dpi=150)
    plt.close(fig)


# ---------------------------------------------------------------------------
#  Quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Verify exact solutions satisfy the PDE at a random point
    rng = np.random.default_rng(42)
    beta, eps = 1.0, 0.01

    # Example 1
    x1, t1 = rng.uniform(-1, 1), rng.uniform(0, 1)
    u = exact_solution_ex1(x1, t1)
    u_t = -np.exp(-t1) * np.sin(np.pi * x1)
    u_x = np.pi * np.exp(-t1) * np.cos(np.pi * x1)
    u_xx = -np.pi**2 * np.exp(-t1) * np.sin(np.pi * x1)
    f1 = source_term_ex1(x1, t1, beta, eps)
    residual1 = u_t + beta * u_x - eps * u_xx - f1
    print(f"Example 1 residual check: {residual1:.2e}  (should be ~0)")

    # Example 2
    x2, t2 = rng.uniform(0, 0.9), rng.uniform(0, 1)  # avoid x~1 for numerics
    u2 = exact_solution_ex2(x2, t2, eps)
    print(f"Example 2 u({x2:.3f},{t2:.3f}) = {u2:.6f}")
    print("Eval module OK.")
