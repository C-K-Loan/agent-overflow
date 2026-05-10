use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus};

/// Verifier type ID for zk_rust bounties
pub const ZK_RUST_VERIFIER_TYPE: u8 = 9;

/// SP1 Groth16 verification key for SP1 SDK v5.x
/// Embedded from sp1-solana crate at build time
const GROTH16_VK: &[u8] = sp1_solana::GROTH16_VK_5_0_0_BYTES;

/// Platform fee in basis points (1%)
const PLATFORM_FEE_BPS: u64 = 100;
const BPS_DENOMINATOR: u64 = 10_000;

#[derive(Accounts)]
pub struct SubmitZkProof<'info> {
    #[account(
        mut,
        seeds = [b"bounty", bounty.question_id.as_ref(), bounty.asker.as_ref()],
        bump,
        constraint = bounty.verifier_type == ZK_RUST_VERIFIER_TYPE @ EscrowError::InvalidVerifierType,
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
        constraint = bounty.deadline > Clock::get()?.unix_timestamp @ EscrowError::BountyExpired,
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [b"vault", bounty.key().as_ref()],
        bump,
        token::mint = bounty.token_mint,
        token::authority = bounty,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Answerer's USDC token account — receives payout
    #[account(
        mut,
        constraint = answerer_ata.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub answerer_ata: Account<'info, TokenAccount>,

    /// Platform fee account
    #[account(
        mut,
        constraint = platform_fee_account.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub platform_fee_account: Account<'info, TokenAccount>,

    /// The answerer — signer, cannot be the bounty asker
    #[account(
        mut,
        constraint = answerer.key() != bounty.asker @ EscrowError::SelfSolve,
    )]
    pub answerer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<SubmitZkProof>,
    proof: Vec<u8>,
    public_values: Vec<u8>,
) -> Result<()> {
    let bounty = &ctx.accounts.bounty;

    // Extract vkey_hash from bounty's verifier_config (first 32 bytes = vkey_hash as hex string)
    // We store it as "0x" + 64 hex chars = 66 bytes in verifier_config
    let vkey_hash = std::str::from_utf8(
        &bounty.verifier_config[..bounty.verifier_config_len as usize]
    ).map_err(|_| EscrowError::InvalidVerifierConfig)?;

    // Verify the SP1 Groth16 proof on-chain
    sp1_solana::verify_proof(
        &proof,
        &public_values,
        vkey_hash,
        GROTH16_VK,
    ).map_err(|_| EscrowError::VerificationFailed)?;

    // Decode public values — expect a single bool (1 byte): 1 = correct, 0 = wrong
    if public_values.is_empty() || public_values[0] == 0 {
        return Err(EscrowError::VerificationFailed.into());
    }

    // Proof is valid and answer is correct — release USDC from vault
    let fee = bounty.amount * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
    let payout = bounty.amount - fee;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"bounty",
        bounty.question_id.as_ref(),
        bounty.asker.as_ref(),
        &[ctx.bumps.bounty],
    ]];

    // Transfer payout to answerer
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.answerer_ata.to_account_info(),
                authority: ctx.accounts.bounty.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    // Transfer fee to platform
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.platform_fee_account.to_account_info(),
                authority: ctx.accounts.bounty.to_account_info(),
            },
            signer_seeds,
        ),
        fee,
    )?;

    // Mark bounty as awarded
    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Awarded;
    bounty.answerer = ctx.accounts.answerer.key();

    msg!("ZK proof verified! Payout: {} USDC", payout);
    Ok(())
}
