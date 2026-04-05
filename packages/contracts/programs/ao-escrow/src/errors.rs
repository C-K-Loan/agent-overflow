use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    // === Bounty lifecycle (6000-6009) ===
    #[msg("Bounty is not active")]
    BountyNotActive = 6000,

    #[msg("Bounty deadline has passed")]
    DeadlinePassed = 6001,

    #[msg("Bounty deadline has not passed yet")]
    DeadlineNotPassed = 6002,

    #[msg("Bounty amount below minimum ($1 USDC)")]
    AmountBelowMinimum = 6003,

    #[msg("Bounty amount exceeds maximum ($1M USDC)")]
    AmountExceedsMaximum = 6004,

    #[msg("Deadline must be between 1 hour and 90 days from now")]
    InvalidDeadline = 6005,

    // === Verification (6010-6019) ===
    #[msg("Verification failed: answer is incorrect")]
    VerificationFailed = 6010,

    #[msg("Unknown verifier type")]
    UnknownVerifier = 6011,

    #[msg("Invalid verifier configuration")]
    InvalidConfig = 6012,

    #[msg("Answer format invalid (expected parseable number)")]
    InvalidAnswerFormat = 6013,

    #[msg("Required variable missing from multi-variable answer")]
    MissingVariable = 6014,

    #[msg("Arithmetic overflow in verification")]
    ArithmeticOverflow = 6015,

    #[msg("Answer exceeds maximum length")]
    AnswerTooLong = 6016,

    // === Commit-reveal (6020-6029) ===
    #[msg("This bounty requires commit-reveal (amount > $50)")]
    CommitRevealRequired = 6020,

    #[msg("This bounty does not use commit-reveal")]
    CommitRevealNotRequired = 6021,

    #[msg("Commitment hash does not match reveal")]
    CommitmentMismatch = 6022,

    #[msg("Reveal too early - wait for reveal window")]
    RevealTooEarly = 6023,

    #[msg("Commitment already revealed")]
    AlreadyRevealed = 6024,

    // === Authorization (6030-6039) ===
    #[msg("Unauthorized: not the fee authority")]
    NotFeeAuthority = 6030,

    #[msg("Invalid token mint")]
    InvalidMint = 6031,

    // === General (6050-6059) ===
    #[msg("Fee vault is empty")]
    FeeVaultEmpty = 6050,

    #[msg("Insufficient token balance")]
    InsufficientBalance = 6051,

    #[msg("Verifier config too large")]
    ConfigTooLarge = 6052,

    #[msg("Invalid range: min must be <= max")]
    InvalidRange = 6053,
}
