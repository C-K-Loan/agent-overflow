"""
Phase 2: Vina scoring from scratch via grid interpolation.

Approach:
  1. Use Vina API to precompute affinity maps for each XS (extended AutoDock) type.
  2. Classify each ligand atom's AD4 type → XS type using bond topology from 3D coords.
  3. Trilinear-interpolate each ligand atom's energy from the receptor grid.
  4. Sum + apply torsional correction: score = Σ E_i / (1 + w_rot * N_rot)

This replicates Vina's actual scoring pipeline rather than reimplementing the
atom-pair kernel, which requires exact XS typing rules from Vina's C++ source.
Must match Phase 1 within ±0.5 kcal/mol.

AD4 → XS type rules (from Vina source atom_constants.h):
  C  → C_H if no N/O/S neighbor within 1.9 Å, else C_P
  A  → C_H  (aromatic, always hydrophobic)
  N  → N_DA if bonded to HD, else N_P
  NA → N_DA if bonded to HD, else N_A
  OA → O_DA if bonded to HD, else O_A
  SA → S_P
  HD → W    (H-bond donor hydrogen, uses the "W" affinity map)
"""
import os, json, math
import numpy as np
from pathlib import Path

try:
    from vina import Vina
    HAS_VINA = True
except ImportError:
    HAS_VINA = False

BASE = Path(__file__).parent.parent
W_ROT = 0.058459   # torsional weight
BOND_CUT = 1.9     # Å, for bond detection from 3D coords
HETERO = {"N", "NA", "O", "OA", "S", "SA"}

XS_TYPES = ["C_H","C_P","N_P","N_A","N_D","N_DA","O_A","O_D","O_DA","O_P","S_P","At","W"]

PROBLEMS = [
    {
        "name":      "Nirmatrelvir vs MPRO",
        "receptor":  BASE / "binding_sites/6LU7_prep.pdbqt",
        "ligand":    BASE / "test_molecules/nirmatrelvir_docked.pdbqt",
        "center":    [-11.6, 14.6, 65.2],
        "box_size":  [25.0, 25.0, 25.0],
        "threshold": -7.0,
        "expected":  -7.616,
    },
    {
        "name":      "Imatinib vs BCR-ABL",
        "receptor":  BASE / "binding_sites/2HYY_prep.pdbqt",
        "ligand":    BASE / "test_molecules/imatinib_docked.pdbqt",
        "center":    [37.2, 37.0, 30.4],
        "box_size":  [30.0, 30.0, 30.0],
        "threshold": -9.0,
        "expected":  -9.092,
    },
    {
        "name":      "Aspirin vs MPRO (control)",
        "receptor":  BASE / "binding_sites/6LU7_prep.pdbqt",
        "ligand":    BASE / "test_molecules/aspirin_docked.pdbqt",
        "center":    [-11.6, 14.6, 65.2],
        "box_size":  [25.0, 25.0, 25.0],
        "threshold": -7.0,
        "expected":  -4.600,
    },
]


# ── AutoDock affinity map parser ────────────────────────────────────────

def parse_ad_map(path):
    """Parse AutoDock .map file → (grid_nz_ny_nx, ox, oy, oz, spacing, nx, ny, nz)."""
    with open(path) as f:
        lines = f.readlines()
    h = {}
    data_start = 0
    for i, l in enumerate(lines):
        s = l.strip()
        if s.startswith("SPACING"):
            h["sp"] = float(s.split()[1])
        elif s.startswith("NELEMENTS"):
            p = s.split(); h["nx"], h["ny"], h["nz"] = int(p[1]), int(p[2]), int(p[3])
        elif s.startswith("CENTER"):
            p = s.split(); h["cx"], h["cy"], h["cz"] = float(p[1]), float(p[2]), float(p[3])
        elif not s.startswith(("GRID", "MACRO")):
            try:
                float(s)
                data_start = i
                break
            except ValueError:
                pass
    vals = np.array([float(l.strip()) for l in lines[data_start:] if l.strip()])
    # AutoDock format: x fastest, z slowest → stored as (nz+1) × (ny+1) × (nx+1)
    nx, ny, nz = h["nx"] + 1, h["ny"] + 1, h["nz"] + 1
    grid = vals[: nz * ny * nx].reshape(nz, ny, nx)
    sp = h["sp"]
    cx, cy, cz = h["cx"], h["cy"], h["cz"]
    ox = cx - (nx - 1) / 2 * sp
    oy = cy - (ny - 1) / 2 * sp
    oz = cz - (nz - 1) / 2 * sp
    return grid, ox, oy, oz, sp, nx, ny, nz


def trilinear(mg, x, y, z):
    """Trilinear interpolation in an AutoDock affinity grid."""
    g, ox, oy, oz, sp, nx, ny, nz = mg
    fx = (x - ox) / sp
    fy = (y - oy) / sp
    fz = (z - oz) / sp
    ix, iy, iz = int(fx), int(fy), int(fz)
    if not (0 <= ix < nx - 1 and 0 <= iy < ny - 1 and 0 <= iz < nz - 1):
        return 0.0
    dx, dy, dz = fx - ix, fy - iy, fz - iz
    return (
        g[iz,   iy,   ix  ] * (1-dx)*(1-dy)*(1-dz) +
        g[iz,   iy,   ix+1] * dx    *(1-dy)*(1-dz) +
        g[iz,   iy+1, ix  ] * (1-dx)*dy    *(1-dz) +
        g[iz,   iy+1, ix+1] * dx    *dy    *(1-dz) +
        g[iz+1, iy,   ix  ] * (1-dx)*(1-dy)*dz     +
        g[iz+1, iy,   ix+1] * dx    *(1-dy)*dz     +
        g[iz+1, iy+1, ix  ] * (1-dx)*dy    *dz     +
        g[iz+1, iy+1, ix+1] * dx    *dy    *dz
    )


# ── PDBQT parser ────────────────────────────────────────────────────────

def parse_pdbqt(path, model=1):
    atoms = []
    cur = 0
    in_t = False
    with open(path) as f:
        for line in f:
            rec = line[:6].strip()
            if rec == "MODEL":
                cur += 1
                in_t = cur == model
                continue
            if rec == "ENDMDL" and in_t:
                break
            if not in_t and model != 1:
                continue
            if rec in ("ATOM", "HETATM"):
                try:
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    atype = line[76:].strip()
                    if atype:
                        atoms.append((x, y, z, atype))
                except (ValueError, IndexError):
                    pass
    return atoms


def parse_torsdof(path, model=1):
    cur = 0
    in_t = False
    with open(path) as f:
        for line in f:
            rec = line[:6].strip()
            if rec == "MODEL":
                cur += 1
                in_t = cur == model
            if rec == "ENDMDL" and in_t:
                break
            if in_t and line.startswith("TORSDOF"):
                return int(line.split()[1])
    with open(path) as f:
        for line in f:
            if line.startswith("TORSDOF"):
                return int(line.split()[1])
    return 0


# ── AD4 → XS type conversion ────────────────────────────────────────────

def _dist2(a1, a2):
    return (a1[0]-a2[0])**2 + (a1[1]-a2[1])**2 + (a1[2]-a2[2])**2

def _bonded_to_hetero(atoms, idx):
    p = atoms[idx]
    return any(_dist2(p, atoms[j]) < BOND_CUT**2 and atoms[j][3] in HETERO
               for j in range(len(atoms)) if j != idx)

def _bonded_to_hd(atoms, idx):
    p = atoms[idx]
    return any(_dist2(p, atoms[j]) < BOND_CUT**2 and atoms[j][3] == "HD"
               for j in range(len(atoms)) if j != idx)

def ad4_to_xs(atoms, idx):
    t = atoms[idx][3]
    if t == "C":  return "C_P" if _bonded_to_hetero(atoms, idx) else "C_H"
    if t == "A":  return "C_H"
    if t == "N":  return "N_DA" if _bonded_to_hd(atoms, idx) else "N_P"
    if t == "NA": return "N_DA" if _bonded_to_hd(atoms, idx) else "N_A"
    if t == "OA": return "O_DA" if _bonded_to_hd(atoms, idx) else "O_A"
    if t == "SA": return "S_P"
    if t == "HD": return "W"
    if t == "F":  return "F_H"
    if t == "Cl": return "Cl_H"
    if t == "Br": return "Br_H"
    if t == "I":  return "I_H"
    return "C_P"


# ── Grid-based scoring ───────────────────────────────────────────────────

def compute_maps(receptor_pdbqt, center, box_size, map_prefix):
    """Compute Vina affinity maps and save to map_prefix.*.map files."""
    assert HAS_VINA, "vina Python package required to compute maps"
    v = Vina(sf_name="vina", verbosity=0)
    v.set_receptor(str(receptor_pdbqt))
    v.compute_vina_maps(center=center, box_size=box_size, force_even_voxels=True)
    v.write_maps(map_prefix)


def load_maps(map_prefix):
    maps = {}
    for xs in XS_TYPES:
        path = f"{map_prefix}.{xs}.map"
        if os.path.exists(path):
            maps[xs] = parse_ad_map(path)
    return maps


def score_pose(maps, ligand_atoms, n_rot):
    """Compute Vina score via grid interpolation."""
    inter = 0.0
    for i, (x, y, z, _) in enumerate(ligand_atoms):
        xs = ad4_to_xs(ligand_atoms, i)
        if xs in maps:
            inter += trilinear(maps[xs], x, y, z)
    return inter / (1.0 + W_ROT * n_rot), inter


if __name__ == "__main__":
    print("Phase 2: Grid-interpolation Vina scorer (must match Phase 1 within ±0.5)")

    with open(BASE / "prototype/vina_api_scores.json") as f:
        phase1 = json.load(f)

    results = {}
    all_ok = True
    rec_maps = {}   # cache by receptor path

    for p in PROBLEMS:
        rec_key = str(p["receptor"])
        if rec_key not in rec_maps:
            map_prefix = f"/tmp/vina_scratch_{p['receptor'].stem}"
            # Compute maps if not already cached
            needs_compute = not os.path.exists(f"{map_prefix}.C_H.map")
            if needs_compute:
                print(f"\nComputing grid maps for {p['receptor'].name}...")
                compute_maps(p["receptor"], p["center"], p["box_size"], map_prefix)
            rec_maps[rec_key] = load_maps(map_prefix)

        maps  = rec_maps[rec_key]
        lig   = parse_pdbqt(p["ligand"])
        nrot  = parse_torsdof(p["ligand"])
        score, inter = score_pose(maps, lig, nrot)

        ref  = phase1[p["name"]]
        diff = abs(score - ref)
        ok   = diff <= 0.5
        all_ok = all_ok and ok
        passed = score < p["threshold"]
        expected_pass = "Aspirin" not in p["name"]
        correct = passed == expected_pass

        print(f"\n{'='*55}")
        print(f"  {p['name']}")
        print(f"  Scratch score:  {score:+.3f} kcal/mol")
        print(f"  Phase-1 ref:    {ref:+.3f} kcal/mol")
        print(f"  Difference:     {diff:+.3f}  {'✓ (≤0.5)' if ok else '✗ (>0.5)'}")
        print(f"  N_rot:          {nrot}")
        print(f"  Threshold {p['threshold']:+.1f}:   {'PASS' if passed else 'FAIL'} ({'correct ✓' if correct else 'WRONG ✗'})")

        results[p["name"]] = score

    print(f"\n\n=== SUMMARY ===")
    for name, score in results.items():
        ref  = phase1[name]
        diff = score - ref
        print(f"  {name}: {score:+.3f}  (phase1={ref:+.3f}, Δ={diff:+.3f})")

    out = Path(__file__).parent / "vina_scratch_scores.json"
    with open(out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to {out}")
    print(f"\nPhase 2: {'ALL WITHIN ±0.5 ✓' if all_ok else 'SOME DIFFS >0.5 ✗'}")
