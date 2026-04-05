use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use crate::errors::EscrowError;

/// Type 0: SHA256 hash match.
/// Config: [u8; 32] — the expected SHA256 hash of the correct answer.
/// Answer never stored on-chain — only its hash is compared.
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
    fn test_exact_string_correct() {
        let answer = "hello world";
        let h = hash(answer.as_bytes());
        assert!(verify(&h.to_bytes(), answer).is_ok());
    }

    #[test]
    fn test_exact_string_wrong() {
        let answer = "hello world";
        let h = hash(answer.as_bytes());
        assert!(verify(&h.to_bytes(), "wrong answer").is_err());
    }

    #[test]
    fn test_exact_string_bad_config() {
        assert!(verify(&[0u8; 16], "test").is_err());
    }
}
