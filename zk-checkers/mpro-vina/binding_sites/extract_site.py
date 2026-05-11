"""
Phase 3 Step 1: Extract receptor binding-site atoms for ZK Vina scoring.

For each receptor (MPRO=6LU7, BCR-ABL=2HYY):
  1. Parse the receptor PDBQT.
  2. Parse the first model of the corresponding docked ligand PDBQT.
  3. Collect receptor atoms within 8.0 Å SURFACE DISTANCE of any ligand atom.
     Surface distance: d = euclidean_dist - R_i - R_j  (must be < 8.0)
  4. Classify each retained atom to XS properties:
       (radius, is_hydrophobic, is_acceptor, is_donor)
     using 3D bond detection (distance < 1.9 Å) to assign C_H vs C_P,
     and donor/acceptor flags.
  5. Write JSON to mpro_site.json / bcrabl_site.json.
  6. Write Rust constant arrays to sp1_program/src/sites.rs.
"""

import json
import math
from pathlib import Path

BASE = Path(__file__).parent.parent
BINDING_SITES_DIR = Path(__file__).parent
SP1_SRC_DIR = BASE / "sp1_program" / "src"

BOND_CUT = 1.9      # Å — bond-detection distance cutoff
CUTOFF = 8.0        # Å — surface-distance cutoff for site extraction
HETERO = {"N", "NA", "O", "OA", "S", "SA"}  # bonded-to-heteroatom detection

# XS atom properties: (vdW_radius, is_hydrophobic, is_acceptor, is_donor)
XS_PROPS = {
    "C_H": (2.00, True,  False, False),  # aliphatic C, no hetero neighbor
    "C_P": (2.00, False, False, False),  # polar C (bonded to N/O/S)
    "A":   (2.00, True,  False, False),  # aromatic C, always hydrophobic → C_H behavior
    "N":   (1.75, False, False, False),  # non-polar N
    "NA":  (1.75, False, True,  False),  # N acceptor (may get donor flag if bonded to HD)
    "OA":  (1.60, False, True,  False),  # O acceptor (may get donor flag if bonded to HD)
    "SA":  (2.00, False, True,  False),  # S acceptor
    "HD":  (1.00, False, False, True),   # H-bond donor hydrogen
    # Fallback for any unrecognised type
    "??":  (1.80, False, False, False),
}


# ── PDBQT parsing ─────────────────────────────────────────────────────

def parse_pdbqt(path, model=1):
    """Return list of (x, y, z, ad4_type) for ATOM/HETATM records in MODEL 1."""
    atoms = []
    cur_model = 0
    in_target = False
    first_model_seen = False

    with open(path) as f:
        for line in f:
            rec = line[:6].strip()
            if rec == "MODEL":
                cur_model += 1
                in_target = (cur_model == model)
                first_model_seen = True
                continue
            if rec == "ENDMDL":
                if in_target:
                    break
                in_target = False
                continue
            # Files without MODEL records: treat entire file as model 1
            if not first_model_seen:
                in_target = True

            if in_target and rec in ("ATOM", "HETATM"):
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


# ── Geometry helpers ──────────────────────────────────────────────────

def dist3(a, b):
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)


def bonded_to_hetero(atoms, idx):
    """True if atom[idx] has any N/NA/O/OA/S/SA neighbor within BOND_CUT."""
    p = atoms[idx]
    for j, q in enumerate(atoms):
        if j == idx:
            continue
        if q[3] in HETERO and dist3(p, q) < BOND_CUT:
            return True
    return False


def bonded_to_hd(atoms, idx):
    """True if atom[idx] has any HD neighbor within BOND_CUT."""
    p = atoms[idx]
    for j, q in enumerate(atoms):
        if j == idx:
            continue
        if q[3] == "HD" and dist3(p, q) < BOND_CUT:
            return True
    return False


def xs_radius(atype):
    """Return vdW radius for a raw AD4 type (for surface-distance calculation)."""
    base = XS_PROPS.get(atype, XS_PROPS["??"])
    return base[0]


# ── XS property classification ────────────────────────────────────────

def classify_xs(atoms, idx):
    """
    Return (radius, is_hydrophobic, is_acceptor, is_donor) for receptor atom idx.
    Follows Vina XS typing rules.
    """
    t = atoms[idx][3]
    if t in ("C", "A"):
        hydro = not bonded_to_hetero(atoms, idx)   # A is aromatic → same rule in practice
        return (2.00, hydro, False, False)
    if t == "N":
        return (1.75, False, False, False)
    if t == "NA":
        donor = bonded_to_hd(atoms, idx)
        return (1.75, False, True, donor)
    if t == "OA":
        donor = bonded_to_hd(atoms, idx)
        return (1.60, False, True, donor)
    if t == "SA":
        return (2.00, False, True, False)
    if t == "HD":
        return (1.00, False, False, True)
    # Fallback
    props = XS_PROPS.get(t, XS_PROPS["??"])
    return props


# ── Site extraction ───────────────────────────────────────────────────

def extract_site(receptor_atoms, ligand_atoms):
    """
    Return list of receptor atoms within surface-distance 8.0 Å of any ligand atom.
    Surface distance: d = euclidean - R_rec - R_lig  (< 8.0 Å).
    Deduplicates by index.
    """
    # Pre-classify ligand radii
    lig_radii = [xs_radius(a[3]) for a in ligand_atoms]

    included = set()
    for j, rec_atom in enumerate(receptor_atoms):
        r_j = xs_radius(rec_atom[3])
        for k, lig_atom in enumerate(ligand_atoms):
            r_k = lig_radii[k]
            d_euclid = dist3(rec_atom, lig_atom)
            d_surface = d_euclid - r_j - r_k
            if d_surface < CUTOFF:
                included.add(j)
                break

    return sorted(included)


def build_site(receptor_atoms, ligand_atoms):
    """
    Return list of dicts:
        {x, y, z, radius, is_hydrophobic, is_acceptor, is_donor, ad4_type}
    for receptor atoms within the binding site.
    """
    indices = extract_site(receptor_atoms, ligand_atoms)
    site = []
    for idx in indices:
        a = receptor_atoms[idx]
        radius, hydro, acceptor, donor = classify_xs(receptor_atoms, idx)
        site.append({
            "x": round(a[0], 4),
            "y": round(a[1], 4),
            "z": round(a[2], 4),
            "radius": radius,
            "is_hydrophobic": hydro,
            "is_acceptor": acceptor,
            "is_donor": donor,
            "ad4_type": a[3],
        })
    return site


# ── Rust code generation ──────────────────────────────────────────────

def site_to_rust_array(site, const_name):
    """Return a Rust &[[f32; 7]] constant definition."""
    lines = [f"pub const {const_name}: &[[f32; 7]] = &["]
    for atom in site:
        h = "1.0" if atom["is_hydrophobic"] else "0.0"
        a = "1.0" if atom["is_acceptor"]    else "0.0"
        d = "1.0" if atom["is_donor"]       else "0.0"
        lines.append(
            f'    [{atom["x"]:.4f}_f32, {atom["y"]:.4f}_f32, {atom["z"]:.4f}_f32, '
            f'{atom["radius"]:.2f}_f32, {h}, {a}, {d}], '
            f'// {atom["ad4_type"]}'
        )
    lines.append("];")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    # MPRO (6LU7) — use nirmatrelvir docked position + aspirin for MPRO site
    # (Union of atoms within 8 Å of nirmatrelvir AND aspirin, both docked to MPRO)
    print("Parsing MPRO receptor (6LU7)...")
    mpro_rec = parse_pdbqt(BASE / "binding_sites/6LU7_prep.pdbqt")
    print(f"  {len(mpro_rec)} receptor atoms total")

    print("Parsing nirmatrelvir (model 1)...")
    nirmat_lig = parse_pdbqt(BASE / "test_molecules/nirmatrelvir_docked.pdbqt", model=1)
    print(f"  {len(nirmat_lig)} ligand atoms")

    print("Parsing aspirin (model 1)...")
    aspirin_lig = parse_pdbqt(BASE / "test_molecules/aspirin_docked.pdbqt", model=1)
    print(f"  {len(aspirin_lig)} ligand atoms")

    # For MPRO site: include atoms close to either ligand (covers both poses)
    combined_mpro_lig = nirmat_lig + aspirin_lig
    mpro_site = build_site(mpro_rec, combined_mpro_lig)
    print(f"  Site atoms extracted: {len(mpro_site)}")

    # BCR-ABL (2HYY) — use imatinib docked position
    print("\nParsing BCR-ABL receptor (2HYY)...")
    bcrabl_rec = parse_pdbqt(BASE / "binding_sites/2HYY_prep.pdbqt")
    print(f"  {len(bcrabl_rec)} receptor atoms total")

    print("Parsing imatinib (model 1)...")
    imatinib_lig = parse_pdbqt(BASE / "test_molecules/imatinib_docked.pdbqt", model=1)
    print(f"  {len(imatinib_lig)} ligand atoms")

    bcrabl_site = build_site(bcrabl_rec, imatinib_lig)
    print(f"  Site atoms extracted: {len(bcrabl_site)}")

    # Write JSON files
    mpro_json = BINDING_SITES_DIR / "mpro_site.json"
    bcrabl_json = BINDING_SITES_DIR / "bcrabl_site.json"

    with open(mpro_json, "w") as f:
        json.dump(mpro_site, f, indent=2)
    print(f"\nWrote {mpro_json} ({len(mpro_site)} atoms)")

    with open(bcrabl_json, "w") as f:
        json.dump(bcrabl_site, f, indent=2)
    print(f"Wrote {bcrabl_json} ({len(bcrabl_site)} atoms)")

    # Write Rust sites.rs
    SP1_SRC_DIR.mkdir(parents=True, exist_ok=True)
    sites_rs = SP1_SRC_DIR / "sites.rs"

    mpro_rust = site_to_rust_array(mpro_site, "MPRO_SITE")
    bcrabl_rust = site_to_rust_array(bcrabl_site, "BCRABL_SITE")

    with open(sites_rs, "w") as f:
        f.write("// Auto-generated by binding_sites/extract_site.py\n")
        f.write("// Each atom: [x, y, z, radius, is_hydrophobic, is_acceptor, is_donor]\n")
        f.write("// is_* encoded as 1.0 (true) or 0.0 (false)\n\n")
        f.write(mpro_rust)
        f.write("\n\n")
        f.write(bcrabl_rust)
        f.write("\n")

    print(f"Wrote {sites_rs}")

    # Quick sanity summary
    print("\n=== Site summary ===")
    mpro_types = {}
    for a in mpro_site:
        t = a["ad4_type"]
        mpro_types[t] = mpro_types.get(t, 0) + 1
    bcrabl_types = {}
    for a in bcrabl_site:
        t = a["ad4_type"]
        bcrabl_types[t] = bcrabl_types.get(t, 0) + 1
    print(f"MPRO site ({len(mpro_site)} atoms): {dict(sorted(mpro_types.items()))}")
    print(f"BCR-ABL site ({len(bcrabl_site)} atoms): {dict(sorted(bcrabl_types.items()))}")


if __name__ == "__main__":
    main()
