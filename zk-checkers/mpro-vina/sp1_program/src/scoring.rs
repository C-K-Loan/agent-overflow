/// Vina scoring function implemented in f32 for the SP1 ZK program.
///
/// Formula:
///   d = euclid_dist(i,j) - R_i - R_j   (surface distance)
///   raw = Σ_{i∈lig, j∈rec, d<8} pair_energy(d, props_i, props_j)
///   score = raw / (1 + W_ROT * n_rot)
///
/// Atom format (both ligand and receptor): [x, y, z, radius, is_hydro, is_acceptor, is_donor]
/// is_* are encoded as 1.0 (true) or 0.0 (false).

// Vina energy weights
const W_GAUSS1: f32 = -0.035579;
const W_GAUSS2: f32 = -0.005156;
const W_REP:    f32 =  0.840245;
const W_HYDRO:  f32 = -0.035069;
const W_HBOND:  f32 = -0.587439;
const W_ROT:    f32 =  0.058459;

// Surface-distance cutoff (Angstroms)
const CUTOFF: f32 = 8.0;

// ── Interaction kernels ────────────────────────────────────────────────

#[inline]
fn gauss1(d: f32) -> f32 {
    let t = d / 0.5_f32;
    libm::expf(-t * t)
}

#[inline]
fn gauss2(d: f32) -> f32 {
    let t = (d - 3.0_f32) / 2.0_f32;
    libm::expf(-t * t)
}

#[inline]
fn repulsion(d: f32) -> f32 {
    if d < 0.0 { d * d } else { 0.0 }
}

#[inline]
fn hydrophobic(d: f32) -> f32 {
    if d <= 0.5 {
        1.0
    } else if d >= 1.5 {
        0.0
    } else {
        1.5 - d
    }
}

#[inline]
fn hbond(d: f32) -> f32 {
    if d >= 0.0 {
        0.0
    } else if d <= -0.7 {
        1.0
    } else {
        -d / 0.7
    }
}

// ── Pair energy ────────────────────────────────────────────────────────

/// Compute the interaction energy between one ligand and one receptor atom.
///
/// `lh/rh` = is_hydrophobic, `la/ra` = is_acceptor, `ld/rd` = is_donor.
///
/// HD atoms (radius ≈ 1.0, donor=true, hydro=false, acceptor=false) skip
/// the gauss/repulsion terms and only contribute via H-bond.
#[inline]
fn pair_energy(d: f32, lh: bool, la: bool, ld: bool, rh: bool, ra: bool, rd: bool) -> f32 {
    // Detect if either atom is an HD (donor-only hydrogen)
    let l_is_hd = ld && !lh && !la;
    let r_is_hd = rd && !rh && !ra;

    if l_is_hd || r_is_hd {
        // HD pairs: only H-bond, no gauss/repulsion
        if (ld && ra) || (rd && la) {
            W_HBOND * hbond(d)
        } else {
            0.0
        }
    } else {
        let mut e = W_GAUSS1 * gauss1(d) + W_GAUSS2 * gauss2(d) + W_REP * repulsion(d);
        if lh && rh {
            e += W_HYDRO * hydrophobic(d);
        }
        if (ld && ra) || (rd && la) {
            e += W_HBOND * hbond(d);
        }
        e
    }
}

// ── Main scoring function ──────────────────────────────────────────────

/// Compute the Vina score for a given ligand pose against a receptor site.
///
/// `ligand`   — slice of [x, y, z, radius, is_hydro, is_acceptor, is_donor]
/// `receptor` — slice of [x, y, z, radius, is_hydro, is_acceptor, is_donor]
/// `n_rot`    — number of rotatable bonds in the ligand
///
/// Returns kcal/mol (negative = favourable).
pub fn vina_score(ligand: &[[f32; 7]], receptor: &[[f32; 7]], n_rot: u32) -> f32 {
    let mut raw = 0.0_f32;

    for la in ligand {
        let (lx, ly, lz, lr) = (la[0], la[1], la[2], la[3]);
        let (lh, lac, ld) = (la[4] != 0.0, la[5] != 0.0, la[6] != 0.0);

        for ra in receptor {
            let (rx, ry, rz, rr) = (ra[0], ra[1], ra[2], ra[3]);
            let (rh, rac, rd) = (ra[4] != 0.0, ra[5] != 0.0, ra[6] != 0.0);

            let dx = lx - rx;
            let dy = ly - ry;
            let dz = lz - rz;
            let euclid = libm::sqrtf(dx * dx + dy * dy + dz * dz);
            let d = euclid - lr - rr;

            if d >= CUTOFF {
                continue;
            }

            raw += pair_energy(d, lh, lac, ld, rh, rac, rd);
        }
    }

    raw / (1.0_f32 + W_ROT * n_rot as f32)
}
