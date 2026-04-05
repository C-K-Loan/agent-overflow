use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Type 3: Range check.
/// Config: i64 min (8 bytes LE) + i64 max (8 bytes LE) = 16 bytes.
/// Verification: min <= submitted <= max
pub fn verify(config: &[u8], answer: &str) -> Result<()> {
    require!(config.len() >= 16, EscrowError::InvalidConfig);

    let min_val = i64::from_le_bytes(
        config[..8]
            .try_into()
            .map_err(|_| error!(EscrowError::InvalidConfig))?,
    );

    let max_val = i64::from_le_bytes(
        config[8..16]
            .try_into()
            .map_err(|_| error!(EscrowError::InvalidConfig))?,
    );

    require!(min_val <= max_val, EscrowError::InvalidRange);

    let submitted: i64 = answer
        .trim()
        .parse()
        .map_err(|_| error!(EscrowError::InvalidAnswerFormat))?;

    require!(
        submitted >= min_val && submitted <= max_val,
        EscrowError::VerificationFailed
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(min: i64, max: i64) -> Vec<u8> {
        let mut config = Vec::new();
        config.extend_from_slice(&min.to_le_bytes());
        config.extend_from_slice(&max.to_le_bytes());
        config
    }

    #[test]
    fn test_within_range() {
        let config = make_config(10, 100);
        assert!(verify(&config, "50").is_ok());
        assert!(verify(&config, "10").is_ok()); // boundary
        assert!(verify(&config, "100").is_ok()); // boundary
    }

    #[test]
    fn test_outside_range() {
        let config = make_config(10, 100);
        assert!(verify(&config, "9").is_err());
        assert!(verify(&config, "101").is_err());
    }

    #[test]
    fn test_single_value_range() {
        // min == max = exact match
        let config = make_config(42, 42);
        assert!(verify(&config, "42").is_ok());
        assert!(verify(&config, "43").is_err());
    }

    #[test]
    fn test_negative_range() {
        let config = make_config(-100, -10);
        assert!(verify(&config, "-50").is_ok());
        assert!(verify(&config, "-5").is_err());
        assert!(verify(&config, "-101").is_err());
    }
}
