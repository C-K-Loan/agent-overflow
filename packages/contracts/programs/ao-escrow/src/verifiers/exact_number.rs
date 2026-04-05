use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Type 1: Exact integer equality.
/// Config: i64 as 8 bytes little-endian.
/// Answer: integer as string, e.g. "42".
pub fn verify(config: &[u8], answer: &str) -> Result<()> {
    require!(config.len() >= 8, EscrowError::InvalidConfig);

    let target = i64::from_le_bytes(
        config[..8]
            .try_into()
            .map_err(|_| error!(EscrowError::InvalidConfig))?,
    );

    let submitted: i64 = answer
        .trim()
        .parse()
        .map_err(|_| error!(EscrowError::InvalidAnswerFormat))?;

    require!(submitted == target, EscrowError::VerificationFailed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_number_correct() {
        let config = 42i64.to_le_bytes();
        assert!(verify(&config, "42").is_ok());
    }

    #[test]
    fn test_exact_number_wrong() {
        let config = 42i64.to_le_bytes();
        assert!(verify(&config, "43").is_err());
    }

    #[test]
    fn test_exact_number_negative() {
        let config = (-100i64).to_le_bytes();
        assert!(verify(&config, "-100").is_ok());
    }

    #[test]
    fn test_exact_number_with_whitespace() {
        let config = 42i64.to_le_bytes();
        assert!(verify(&config, " 42 ").is_ok());
    }

    #[test]
    fn test_exact_number_not_a_number() {
        let config = 42i64.to_le_bytes();
        assert!(verify(&config, "abc").is_err());
    }
}
