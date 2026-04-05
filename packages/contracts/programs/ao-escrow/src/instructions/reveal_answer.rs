use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus, CommitRecord};
use crate::verifiers;

#[derive(Accounts)]
pub struct RevealAnswer<'info> {
    #[account(mut)]
    pub revealer: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    #[account(
        mut,
        seeds = [COMMIT_SEED, bounty.key().as_ref(), revealer.key().as_ref()],
        bump = commit_record.bump,
        constraint = !commit_record.revealed @ EscrowError::AlreadyRevealed,
    )]
    pub commit_record: Account<'info, CommitRecord>,

    /// Vault holding escrowed USDC
    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Revealer's USDC token account (receives payout)
    #[account(
        mut,
        constraint = revealer_token_account.owner == revealer.key(),
        constraint = revealer_token_account.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub revealer_token_account: Account<'info, TokenAccount>,

    /// Fee vault (receives 1% platform fee)
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RevealAnswer>, answer: String, nonce: String) -> Result<()> {
    let commit_record = &ctx.accounts.commit_record;
    let bounty = &ctx.accounts.bounty;

    // Verify reveal window (must wait REVEAL_DELAY_SLOTS)
    let clock = Clock::get()?;
    require!(
        clock.slot >= commit_record.slot + REVEAL_DELAY_SLOTS,
        EscrowError::RevealTooEarly
    );

    // Check deadline not passed
    require!(clock.unix_timestamp <= bounty.deadline, EscrowError::DeadlinePassed);

    // Check answer length
    require!(answer.len() <= MAX_ANSWER_LEN, EscrowError::AnswerTooLong);

    // Verify commitment: hash(answer + nonce) must match stored commitment
    let mut preimage = Vec::with_capacity(answer.len() + nonce.len());
    preimage.extend_from_slice(answer.as_bytes());
    preimage.extend_from_slice(nonce.as_bytes());
    let computed_hash = hash(&preimage);
    require!(
        computed_hash.to_bytes() == commit_record.commitment,
        EscrowError::CommitmentMismatch
    );

    // Run verification (only use actual config bytes)
    let cfg_len = bounty.verifier_config_len as usize;
    let config = &bounty.verifier_config[..cfg_len];
    verifiers::verify_answer(bounty.verifier_type, config, &answer)?;

    // Verification passed — calculate fee and payout
    let fee = bounty.amount * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
    let payout = bounty.amount - fee;

    // Transfer payout: vault → revealer
    let bounty_key = ctx.accounts.bounty.key();
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        bounty_key.as_ref(),
        &[bounty.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    let cpi_payout = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.revealer_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_payout,
            signer_seeds,
        ),
        payout,
    )?;

    // Transfer fee: vault → fee_vault
    if fee > 0 {
        let cpi_fee = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_fee,
                signer_seeds,
            ),
            fee,
        )?;
    }

    // Update state
    let commit_record = &mut ctx.accounts.commit_record;
    commit_record.revealed = true;

    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Awarded;
    bounty.answerer = ctx.accounts.revealer.key();

    emit!(BountyAwardedEvent {
        bounty: ctx.accounts.bounty.key(),
        answerer: ctx.accounts.revealer.key(),
        payout,
        fee,
    });

    Ok(())
}

// Re-use the same event from submit_answer
#[event]
pub struct BountyAwardedEvent {
    pub bounty: Pubkey,
    pub answerer: Pubkey,
    pub payout: u64,
    pub fee: u64,
}
