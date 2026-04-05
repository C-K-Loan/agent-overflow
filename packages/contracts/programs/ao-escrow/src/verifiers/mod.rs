pub mod exact_string;
pub mod exact_number;
pub mod numeric_tolerance;
pub mod numeric_range;
pub mod multi_numeric;

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
        255 => Ok(()), // Custom verifier — handled via CPI in instruction handler
        _ => err!(EscrowError::UnknownVerifier),
    }
}
