"""
Prepare SP1 prover input JSON from a docked PDBQT file.

Usage:
  python3 prepare_input.py nirmatrelvir_docked.pdbqt --problem 0  # MPRO
  python3 prepare_input.py imatinib_docked.pdbqt     --problem 1  # BCR-ABL
  python3 prepare_input.py aspirin_docked.pdbqt      --problem 0  # MPRO (control)

Output: input.json in the same directory as the PDBQT file.
"""
import argparse, json, math
from pathlib import Path

BOND_CUT = 1.9
HETERO = {"N", "NA", "O", "OA", "S", "SA"}

BASE_PROPS = {
    "C":  (2.00, None,  False, False),
    "A":  (2.00, True,  False, False),
    "N":  (1.75, False, False, False),
    "NA": (1.75, False, True,  False),
    "OA": (1.60, False, True,  False),
    "SA": (2.00, False, True,  False),
    "HD": (1.00, False, False, True),
    "F":  (1.54, True,  False, False),
    "Cl": (1.80, True,  False, False),
    "Br": (1.98, True,  False, False),
    "I":  (2.14, True,  False, False),
}


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
                    atoms.append((float(line[30:38]), float(line[38:46]), float(line[46:54]), line[76:].strip()))
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


def _dist2(a, b):
    return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2


def atom_to_row(atoms, idx):
    """Return [x, y, z, radius, is_hydrophobic, is_acceptor, is_donor] as floats."""
    x, y, z, t = atoms[idx]
    r, h, a, d = BASE_PROPS.get(t, (2.00, False, False, False))
    if t == "C":
        h = not any(_dist2(atoms[idx], atoms[j]) < BOND_CUT**2 and atoms[j][3] in HETERO
                    for j in range(len(atoms)) if j != idx)
    elif t in ("NA", "OA"):
        d = any(_dist2(atoms[idx], atoms[j]) < BOND_CUT**2 and atoms[j][3] == "HD"
                for j in range(len(atoms)) if j != idx)
    return [float(x), float(y), float(z), float(r),
            1.0 if h else 0.0, 1.0 if a else 0.0, 1.0 if d else 0.0]


def main():
    p = argparse.ArgumentParser(description="Prepare SP1 prover input from docked PDBQT")
    p.add_argument("pdbqt", help="Path to docked PDBQT file (model 1)")
    p.add_argument("--problem", type=int, choices=[0, 1], required=True,
                   help="Problem ID: 0=MPRO, 1=BCR-ABL")
    p.add_argument("-o", "--output", default=None, help="Output JSON path (default: input.json alongside PDBQT)")
    args = p.parse_args()

    pdbqt_path = Path(args.pdbqt)
    atoms = parse_pdbqt(pdbqt_path)
    nrot = parse_torsdof(pdbqt_path)

    ligand = [atom_to_row(atoms, i) for i in range(len(atoms))]

    data = {
        "problem_id": args.problem,
        "ligand": ligand,
        "n_rot": nrot,
    }

    out_path = Path(args.output) if args.output else pdbqt_path.parent / "input.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)

    problem_name = {0: "MPRO", 1: "BCR-ABL"}[args.problem]
    print(f"Wrote {out_path}")
    print(f"  problem_id: {args.problem} ({problem_name})")
    print(f"  atoms: {len(ligand)}")
    print(f"  n_rot: {nrot}")


if __name__ == "__main__":
    main()
