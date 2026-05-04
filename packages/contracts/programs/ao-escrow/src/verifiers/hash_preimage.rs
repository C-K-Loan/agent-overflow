use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use crate::errors::EscrowError;

/// Type 5: Hash preimage — submit a string, verify its SHA256 matches the stored hash.
/// Config: [u8; 32] — the target SHA256 hash (identical binary format to exact_string).
/// Semantically distinct: used for proof-of-knowledge puzzles where the answer is a secret.
pub fn verify(config: &[u8], answer: &str) -> Result<()> {
    require!(config.len() == 32, EscrowError::InvalidConfig);

    let expected: [u8; 32] = config
        .try_into()
        .map_err(|_| error!(EscrowError::InvalidConfig))?;

    let actual = hash(answer.as_bytes());

    require!(actual.to_bytes() == expected, EscrowError::VerificationFailed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::solana_program::hash::hash;

    #[test]
    fn test_correct_preimage() {
        let answer = "secret_password_42";
        let h = hash(answer.as_bytes());
        assert!(verify(&h.to_bytes(), answer).is_ok());
    }

    #[test]
    fn test_wrong_preimage() {
        let answer = "secret_password_42";
        let h = hash(answer.as_bytes());
        assert!(verify(&h.to_bytes(), "wrong_guess").is_err());
    }

    #[test]
    fn test_empty_string_preimage() {
        let answer = "";
        let h = hash(answer.as_bytes());
        assert!(verify(&h.to_bytes(), answer).is_ok());
    }
}
