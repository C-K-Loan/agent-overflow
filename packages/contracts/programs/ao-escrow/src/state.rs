use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
#[repr(u8)]
pub enum BountyStatus {
    Active = 0,
    Awarded = 1,
    Refunded = 2,
}

/// Max verifier config size. Sized to fit BPF stack (4096 byte limit).
/// Supports: exact_string(32B), exact_number(8B), tolerance(16B), range(16B),
/// multi_numeric up to ~3 vars (3 * (1+8+8+8) = ~75B but we cap at 64).
pub const VERIFIER_CONFIG_SIZE: usize = 64;

#[account]
#[derive(InitSpace)]
pub struct Bounty {
    /// SHA256 of question ID string
    pub question_id: [u8; 32],
    /// Who funded the bounty
    pub asker: Pubkey,
    /// USDC amount in native units (6 decimals)
    pub amount: u64,
    /// USDC mint address (validated on creation)
    pub token_mint: Pubkey,
    /// Verifier type: 0-9 pre-built, 255 custom
    pub verifier_type: u8,
    /// Borsh-serialized verifier config (fixed-size, padded with zeros)
    pub verifier_config: [u8; VERIFIER_CONFIG_SIZE],
    /// Actual used bytes in verifier_config
    pub verifier_config_len: u8,
    /// Unix timestamp deadline
    pub deadline: i64,
    /// Bounty status
    pub status: BountyStatus,
    /// Winner pubkey (Pubkey::default() if not yet awarded)
    pub answerer: Pubkey,
    /// True if amount > COMMIT_REVEAL_THRESHOLD
    pub commit_reveal: bool,
    /// PDA bump
    pub bump: u8,
    /// Vault PDA bump
    pub vault_bump: u8,
    /// Clock timestamp at creation
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct CommitRecord {
    /// Which bounty this commitment is for
    pub bounty: Pubkey,
    /// Who committed
    pub committer: Pubkey,
    /// SHA256(answer + nonce)
    pub commitment: [u8; 32],
    /// Slot when committed
    pub slot: u64,
    /// Already revealed?
    pub revealed: bool,
    /// PDA bump
    pub bump: u8,
}
