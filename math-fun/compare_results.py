"""Side-by-side comparison table and bar chart for all 3 approaches."""

import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

# Results collected from training runs
results = {
    "Example 1 (smooth)": {
        "Approach 1\nVanilla PACMANN":       {"l2_rel": 2.544e-03, "linf": 4.615e-03, "rmse": 1.182e-03},
        "Approach 2\nAdam PACMANN":           {"l2_rel": 1.981e-03, "linf": 4.355e-03, "rmse": 9.204e-04},
        "Approach 3\nHard + Robust":          {"l2_rel": 4.882e-04, "linf": 8.151e-04, "rmse": 2.268e-04},
    },
    "Example 2 (boundary layer)": {
        "Approach 1\nVanilla PACMANN":       {"l2_rel": 6.215e-03, "linf": 5.465e-02, "rmse": 2.304e-03},
        "Approach 2\nAdam PACMANN":           {"l2_rel": 4.742e-01, "linf": 4.755e-01, "rmse": 1.758e-01},
        "Approach 3\nHard + Robust":          {"l2_rel": 2.285e-03, "linf": 3.152e-03, "rmse": 8.471e-04},
    },
}

# --- Print table ---
print("=" * 80)
print("COMPARISON: All 3 Approaches  |  beta=1.0, eps=0.01, 10k epochs")
print("=" * 80)
for ex_name, approaches in results.items():
    print(f"\n  {ex_name}")
    print(f"  {'Approach':<28s} {'Rel L2':>12s} {'L-inf':>12s} {'RMSE':>12s}")
    print("  " + "-" * 66)
    for ap_name, m in approaches.items():
        short = ap_name.replace("\n", " / ")
        print(f"  {short:<28s} {m['l2_rel']:>12.4e} {m['linf']:>12.4e} {m['rmse']:>12.4e}")
print()

# --- Bar chart ---
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
metrics = ["l2_rel", "linf", "rmse"]
labels = ["Rel L2", "L-inf", "RMSE"]
colors = ["#4C72B0", "#DD8452", "#55A868"]

for ax, (ex_name, approaches) in zip(axes, results.items()):
    ap_names = list(approaches.keys())
    x = np.arange(len(ap_names))
    width = 0.25

    for i, (metric, label, color) in enumerate(zip(metrics, labels, colors)):
        vals = [approaches[a][metric] for a in ap_names]
        ax.bar(x + i * width, vals, width, label=label, color=color)

    ax.set_yscale("log")
    ax.set_xticks(x + width)
    ax.set_xticklabels(ap_names, fontsize=9)
    ax.set_title(ex_name, fontsize=12)
    ax.set_ylabel("Error (log scale)")
    ax.legend(fontsize=8)

fig.suptitle("Approach Comparison  |  beta=1.0, eps=0.01, 10k epochs", fontsize=13)
plt.tight_layout()

save_dir = Path("results")
save_dir.mkdir(exist_ok=True)
fig.savefig(save_dir / "comparison.png", dpi=150)
plt.close(fig)
print(f"Comparison chart saved to {save_dir / 'comparison.png'}")
