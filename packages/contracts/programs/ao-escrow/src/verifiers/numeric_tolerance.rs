use anchor_lang::prelude::*;
use crate::errors::EscrowError;

/// Type 2: Fixed-point tolerance check.
/// Config: i64 target (8 bytes LE) + u64 epsilon (8 bytes LE) = 16 bytes.
/// All values in fixed-point with 10^6 scaling (matching USDC decimals).
/// Verification: |submitted - target| <= epsilon
pub fn verify(config: &[u8], answer: &str) -> Result<()> {
    require!(config.len() >= 16, EscrowError::InvalidConfig);

    let target = i64::from_le_bytes(
        config[..8]
            .try_into()
            .map_err(|_| error!(EscrowError::InvalidConfig))?,
    );

    let epsilon = u64::from_le_bytes(
        config[8..16]
            .try_into()
            .map_err(|_| error!(EscrowError::InvalidConfig))?,
    );

    let submitted: i64 = answer
        .trim()
        .parse()
        .map_err(|_| error!(EscrowError::InvalidAnswerFormat))?;

    let diff = submitted
        .checked_sub(target)
        .ok_or_else(|| error!(EscrowError::ArithmeticOverflow))?
        .unsigned_abs();

    require!(diff <= epsilon, EscrowError::VerificationFailed);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(target: i64, epsilon: u64) -> Vec<u8> {
        let mut config = Vec::new();
        config.extend_from_slice(&target.to_le_bytes());
        config.extend_from_slice(&epsilon.to_le_bytes());
        config
    }

    #[test]
    fn test_within_tolerance() {
        // target=3141590 (3.14159), epsilon=1000 (0.001)
        let config = make_config(3_141_590, 1_000);
        assert!(verify(&config, "3141590").is_ok()); // exact
        assert!(verify(&config, "3142590").is_ok()); // +0.001
        assert!(verify(&config, "3140590").is_ok()); // -0.001
    }

    #[test]
    fn test_outside_tolerance() {
        let config = make_config(3_141_590, 1_000);
        assert!(verify(&config, "3143000").is_err()); // too far
    }

    #[test]
    fn test_exact_boundary() {
        // At exactly epsilon distance — should pass (inclusive)
        let config = make_config(100, 5);
        assert!(verify(&config, "105").is_ok());
        assert!(verify(&config, "95").is_ok());
        assert!(verify(&config, "106").is_err());
        assert!(verify(&config, "94").is_err());
    }

    #[test]
    fn test_zero_epsilon() {
        // epsilon=0 means exact match
        let config = make_config(42, 0);
        assert!(verify(&config, "42").is_ok());
        assert!(verify(&config, "43").is_err());
    }

    #[test]
    fn test_negative_target() {
        let config = make_config(-1_000_000, 100);
        assert!(verify(&config, "-1000000").is_ok());
        assert!(verify(&config, "-999950").is_ok());
        assert!(verify(&config, "-999800").is_err());
    }
}
