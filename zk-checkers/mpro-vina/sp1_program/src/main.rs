//! SP1 ZK program: Vina drug-scoring checker.
//!
//! Public input:  problem_id: u8  (0 = MPRO, 1 = BCR-ABL)
//! Private input: (Vec<[f32; 7]>, u32)
//!                  ligand atoms: [x, y, z, radius, is_hydro, is_acceptor, is_donor]
//!                  n_rot: number of rotatable bonds
//! Public output: [passed: u8, score_i32_lo: u8, score_i32_hi_lo: u8, score_i32_hi_hi: u8]
//!                passed = 1 if score < threshold, 0 otherwise
//!                score encoded as i32 = (score * 1000) as i32, little-endian bytes

#![no_main]
sp1_zkvm::entrypoint!(main);

mod scoring;
mod sites;

use scoring::vina_score;
use sites::{BCRABL_SITE, MPRO_SITE};

// Thresholds (in kcal/mol, based on Python validation of our scoring function):
//   Nirmatrelvir vs MPRO  → score ≈ -9.47  (should PASS → score < threshold)
//   Aspirin vs MPRO       → score ≈ -5.34  (should FAIL → score ≥ threshold)
//   → MPRO threshold = -7.5  (between -9.47 and -5.34)
//
//   Imatinib vs BCR-ABL   → score ≈ -11.60 (should PASS)
//   → BCR-ABL threshold = -10.5 (conservative margin below -11.60)
const MPRO_THRESHOLD: f32   = -7.5;
const BCRABL_THRESHOLD: f32 = -10.5;

pub fn main() {
    // Read public input: problem_id
    let problem_id: u8 = sp1_zkvm::io::read::<u8>();

    // Read private input: ligand atoms + n_rot
    let ligand: Vec<[f32; 7]> = sp1_zkvm::io::read::<Vec<[f32; 7]>>();
    let n_rot: u32 = sp1_zkvm::io::read::<u32>();

    // Select receptor site and threshold based on problem_id
    let (receptor, threshold): (&[[f32; 7]], f32) = match problem_id {
        0 => (MPRO_SITE,   MPRO_THRESHOLD),
        1 => (BCRABL_SITE, BCRABL_THRESHOLD),
        _ => panic!("unknown problem_id"),
    };

    // Compute Vina score
    let score: f32 = vina_score(&ligand, receptor, n_rot);

    // Determine pass/fail
    let passed: u8 = if score < threshold { 1 } else { 0 };

    // Encode score as integer (score * 1000), clamped to i32
    let score_millis: i32 = (score * 1000.0) as i32;

    // Commit public values
    sp1_zkvm::io::commit(&passed);
    sp1_zkvm::io::commit(&score_millis);
}
