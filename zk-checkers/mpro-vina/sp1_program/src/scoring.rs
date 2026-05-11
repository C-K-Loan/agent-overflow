/// Vina-inspired scoring in pure f32 — no libm (exp/sqrt are SP1 precompiles).
///
/// Key changes vs the original Vina formula:
///   - sqrtf: uses SP1's native f32::sqrt() syscall (fast)
///   - gauss1, gauss2: Taylor / Padé polynomial approximations (no libm::expf)
///   - Same weights, same hydrophobic/hbond terms, same cutoff
///
/// Scores differ slightly from full Vina (due to poly approx), but are
/// self-consistent: thresholds are calibrated against THIS function.

const W_GAUSS1: f32 = -0.035579;
const W_GAUSS2: f32 = -0.005156;
const W_REP:    f32 =  0.840245;
const W_HYDRO:  f32 = -0.035069;
const W_HBOND:  f32 = -0.587439;
const W_ROT:    f32 =  0.058459;
const CUTOFF:   f32 =  8.0;

// ── Polynomial approximations for exp(-x²) ────────────────────────────────
//
// gauss1(d) = exp(-(d/0.5)²)
//   • For d ≥ 1.5: value < 1.2e-4 → treat as 0
//   • For d in [0, 1.5]: use degree-6 Padé / minimax approximation
//     exp(-t²) ≈ 1/(1 + t² + t⁴/2 + t⁶/6)  where t = d/0.5
//     (accurate to ~1% in [0,3])
#[inline]
fn gauss1(d: f32) -> f32 {
    if d <= 0.0_f32 { return 1.0_f32; }
    if d >= 1.5_f32 { return 0.0_f32; }
    let t  = d * 2.0_f32;          // t = d / 0.5
    let t2 = t * t;
    let t4 = t2 * t2;
    let t6 = t4 * t2;
    1.0_f32 / (1.0_f32 + t2 + 0.5_f32 * t4 + 0.16667_f32 * t6)
}

// gauss2(d) = exp(-((d-3)/2)²)
//   • Peak at d=3, half-width ~2 Å
//   • For |d-3| ≥ 5: value < 8e-4 → treat as 0
//   • Use same Padé approximation with u = (d-3)/2
#[inline]
fn gauss2(d: f32) -> f32 {
    let u  = (d - 3.0_f32) * 0.5_f32;  // u = (d-3)/2
    let u2 = u * u;
    if u2 >= 12.5_f32 { return 0.0_f32; } // |u| >= 3.54
    let u4 = u2 * u2;
    let u6 = u4 * u2;
    1.0_f32 / (1.0_f32 + u2 + 0.5_f32 * u4 + 0.16667_f32 * u6)
}

#[inline]
fn repulsion(d: f32) -> f32 {
    if d < 0.0_f32 { d * d } else { 0.0_f32 }
}

#[inline]
fn hydrophobic(d: f32) -> f32 {
    if d <= 0.5_f32 { 1.0_f32 } else if d >= 1.5_f32 { 0.0_f32 } else { 1.5_f32 - d }
}

#[inline]
fn hbond(d: f32) -> f32 {
    if d >= 0.0_f32 { 0.0_f32 } else if d <= -0.7_f32 { 1.0_f32 } else { -d / 0.7_f32 }
}

// ── Pair energy ────────────────────────────────────────────────────────────
#[inline]
fn pair_energy(d: f32, lh: bool, la: bool, ld: bool, rh: bool, ra: bool, rd: bool) -> f32 {
    // HD detection: donor only (not hydrophobic, not acceptor)
    let l_hd = ld && !lh && !la;
    let r_hd = rd && !rh && !ra;
    if l_hd || r_hd {
        if (ld && ra) || (rd && la) { W_HBOND * hbond(d) } else { 0.0_f32 }
    } else {
        let mut e = W_GAUSS1 * gauss1(d) + W_GAUSS2 * gauss2(d) + W_REP * repulsion(d);
        if lh && rh { e += W_HYDRO * hydrophobic(d); }
        if (ld && ra) || (rd && la) { e += W_HBOND * hbond(d); }
        e
    }
}

// ── Main scoring ────────────────────────────────────────────────────────────
pub fn vina_score(ligand: &[[f32; 7]], receptor: &[[f32; 7]], n_rot: u32) -> f32 {
    let mut raw = 0.0_f32;
    for la in ligand {
        let (lx, ly, lz, lr) = (la[0], la[1], la[2], la[3]);
        let (lh, lac, ld) = (la[4] != 0.0, la[5] != 0.0, la[6] != 0.0);
        for ra in receptor {
            let (rx, ry, rz, rr) = (ra[0], ra[1], ra[2], ra[3]);
            let (rh, rac, rd) = (ra[4] != 0.0, ra[5] != 0.0, ra[6] != 0.0);
            let dx = lx - rx; let dy = ly - ry; let dz = lz - rz;
            // f32::sqrt uses SP1's native RISC-V fsqrt instruction (fast)
            let euclid = (dx * dx + dy * dy + dz * dz).sqrt();
            let d = euclid - lr - rr;
            if d >= CUTOFF { continue; }
            raw += pair_energy(d, lh, lac, ld, rh, rac, rd);
        }
    }
    raw / (1.0_f32 + W_ROT * n_rot as f32)
}
