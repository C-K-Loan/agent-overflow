use anchor_lang::prelude::*;
use crate::errors::EscrowError;
use crate::constants::MAX_MULTI_NUMERIC_VARS;

/// Type 4: Multi-variable tolerance check.
/// Config format:
///   [count: u8]
///   For each variable:
///     [key_len: u8, key: [u8; key_len], target: i64 (8 bytes LE), epsilon: u64 (8 bytes LE)]
///
/// Answer format: "key1=value1,key2=value2,..."
/// All values in fixed-point with 10^6 scaling.
/// Every configured variable must be present and within its tolerance.
pub fn verify(config: &[u8], answer: &str) -> Result<()> {
    require!(!config.is_empty(), EscrowError::InvalidConfig);

    let count = config[0] as usize;
    require!(
        count > 0 && count <= MAX_MULTI_NUMERIC_VARS,
        EscrowError::InvalidConfig
    );

    // Parse answer: "key1=val1,key2=val2"
    let pairs: Vec<(&str, i64)> = answer
        .split(',')
        .filter(|s| !s.is_empty())
        .map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts
                .next()
                .ok_or_else(|| error!(EscrowError::InvalidAnswerFormat))?
                .trim();
            let val_str = parts
                .next()
                .ok_or_else(|| error!(EscrowError::InvalidAnswerFormat))?
                .trim();
            let val: i64 = val_str
                .parse()
                .map_err(|_| error!(EscrowError::InvalidAnswerFormat))?;
            Ok((key, val))
        })
        .collect::<Result<Vec<_>>>()?;

    let mut cursor = 1usize;

    for _ in 0..count {
        // Read key
        require!(cursor < config.len(), EscrowError::InvalidConfig);
        let key_len = config[cursor] as usize;
        cursor += 1;

        require!(
            cursor + key_len + 16 <= config.len(),
            EscrowError::InvalidConfig
        );

        let key = core::str::from_utf8(&config[cursor..cursor + key_len])
            .map_err(|_| error!(EscrowError::InvalidConfig))?;
        cursor += key_len;

        // Read target (i64) and epsilon (u64)
        let target = i64::from_le_bytes(
            config[cursor..cursor + 8]
                .try_into()
                .map_err(|_| error!(EscrowError::InvalidConfig))?,
        );
        cursor += 8;

        let epsilon = u64::from_le_bytes(
            config[cursor..cursor + 8]
                .try_into()
                .map_err(|_| error!(EscrowError::InvalidConfig))?,
        );
        cursor += 8;

        // Find this key in the answer
        let submitted = pairs
            .iter()
            .find(|(k, _)| *k == key)
            .map(|(_, v)| *v)
            .ok_or_else(|| error!(EscrowError::MissingVariable))?;

        // Check tolerance
        let diff = submitted
            .checked_sub(target)
            .ok_or_else(|| error!(EscrowError::ArithmeticOverflow))?
            .unsigned_abs();

        require!(diff <= epsilon, EscrowError::VerificationFailed);
    }

    Ok(())
}

/// Helper to build a multi-numeric config from a list of (key, target, epsilon) tuples.
/// Useful for tests and backend serialization.
pub fn build_config(vars: &[(&str, i64, u64)]) -> Vec<u8> {
    let mut config = Vec::new();
    config.push(vars.len() as u8);
    for (key, target, epsilon) in vars {
        config.push(key.len() as u8);
        config.extend_from_slice(key.as_bytes());
        config.extend_from_slice(&target.to_le_bytes());
        config.extend_from_slice(&epsilon.to_le_bytes());
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multi_all_pass() {
        let config = build_config(&[
            ("u_0", 1_000_000, 1_000),  // target=1.0, epsilon=0.001
            ("u_1", 500_000, 10_000),   // target=0.5, epsilon=0.01
        ]);
        assert!(verify(&config, "u_0=1000200,u_1=499000").is_ok());
    }

    #[test]
    fn test_multi_one_fails() {
        let config = build_config(&[
            ("u_0", 1_000_000, 1_000),
            ("u_1", 500_000, 10_000),
        ]);
        // u_0 within tolerance, u_1 outside
        assert!(verify(&config, "u_0=1000200,u_1=520000").is_err());
    }

    #[test]
    fn test_multi_missing_variable() {
        let config = build_config(&[
            ("u_0", 1_000_000, 1_000),
            ("u_1", 500_000, 10_000),
        ]);
        // Missing u_1
        assert!(verify(&config, "u_0=1000200").is_err());
    }

    #[test]
    fn test_multi_single_variable() {
        let config = build_config(&[("x", 42_000_000, 0)]);
        assert!(verify(&config, "x=42000000").is_ok());
        assert!(verify(&config, "x=42000001").is_err());
    }

    #[test]
    fn test_multi_extra_variables_ok() {
        // Extra variables in answer are ignored (only config vars checked)
        let config = build_config(&[("x", 100, 5)]);
        assert!(verify(&config, "x=102,y=999,z=0").is_ok());
    }
}
