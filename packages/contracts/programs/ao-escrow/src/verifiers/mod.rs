pub mod exact_string;
pub mod exact_number;
pub mod numeric_tolerance;
pub mod numeric_range;
pub mod multi_numeric;
pub mod hash_preimage;
pub mod sat;
pub mod graph_coloring;

use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Dispatch to the correct verifier based on type ID.
/// Returns Ok(()) if the answer is correct, Err otherwise.
pub fn verify_answer(verifier_type: u8, config: &[u8], answer: &str) -> Result<()> {
    match verifier_type {
        0 => exact_string::verify(config, answer),
        1 => exact_number::verify(config, answer),
        2 => numeric_tolerance::verify(config, answer),
        3 => numeric_range::verify(config, answer),
        4 => multi_numeric::verify(config, answer),
        5 => hash_preimage::verify(config, answer),
        6 => sat::verify(config, answer),
        7 => graph_coloring::verify(config, answer),
        _ => err!(EscrowError::UnknownVerifier),
    }
}
