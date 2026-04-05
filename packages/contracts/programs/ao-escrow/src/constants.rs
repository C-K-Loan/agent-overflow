/// Platform fee in basis points (1% = 100 bps)
pub const PLATFORM_FEE_BPS: u64 = 100;

/// Bounties above this amount require commit-reveal ($50 USDC in native units)
pub const COMMIT_REVEAL_THRESHOLD: u64 = 50_000_000;

/// Number of slots to wait between commit and reveal (~2 seconds)
pub const REVEAL_DELAY_SLOTS: u64 = 5;

/// Maximum verifier config size in bytes
pub const MAX_VERIFIER_CONFIG_LEN: usize = 256;

/// Minimum bounty amount ($1 USDC in native units)
pub const MIN_BOUNTY_AMOUNT: u64 = 1_000_000;

/// Maximum bounty amount ($1M USDC in native units)
pub const MAX_BOUNTY_AMOUNT: u64 = 1_000_000_000_000;

/// Maximum deadline duration (90 days in seconds)
pub const MAX_DEADLINE_DURATION: i64 = 90 * 24 * 3600;

/// Minimum deadline duration (1 hour in seconds)
pub const MIN_DEADLINE_DURATION: i64 = 3600;

/// Maximum answer length in bytes
pub const MAX_ANSWER_LEN: usize = 1024;

/// Maximum number of variables in multi_numeric verifier
pub const MAX_MULTI_NUMERIC_VARS: usize = 16;

/// Fee denominator (10_000 bps = 100%)
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Seed prefixes for PDAs
pub const BOUNTY_SEED: &[u8] = b"bounty";
pub const VAULT_SEED: &[u8] = b"vault";
pub const COMMIT_SEED: &[u8] = b"commit";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";
