use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus};
use crate::verifiers;

#[derive(Accounts)]
pub struct SubmitAnswer<'info> {
    #[account(mut)]
    pub answerer: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    /// Vault holding escrowed USDC
    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Answerer's USDC token account (receives payout)
    #[account(
        mut,
        constraint = answerer_token_account.owner == answerer.key(),
        constraint = answerer_token_account.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub answerer_token_account: Account<'info, TokenAccount>,

    /// Platform fee account — any token account with matching mint.
    /// Not a PDA so it works with any USDC mint (devnet or mainnet).
    /// The backend always passes the platform wallet's ATA for the bounty's mint.
    #[account(
        mut,
        constraint = platform_fee_account.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub platform_fee_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SubmitAnswer>, answer: String) -> Result<()> {
    let bounty = &ctx.accounts.bounty;

    // Check deadline not passed
    let clock = Clock::get()?;
    require!(clock.unix_timestamp <= bounty.deadline, EscrowError::DeadlinePassed);

    // Check answer length
    require!(answer.len() <= MAX_ANSWER_LEN, EscrowError::AnswerTooLong);

    // If commit-reveal is required, reject direct submission
    require!(!bounty.commit_reveal, EscrowError::CommitRevealRequired);

    // Run verification (only use actual config bytes, not zero padding)
    let cfg_len = bounty.verifier_config_len as usize;
    let config = &bounty.verifier_config[..cfg_len];
    verifiers::verify_answer(bounty.verifier_type, config, &answer)?;

    // Verification passed — calculate fee and payout
    let fee = bounty.amount * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
    let payout = bounty.amount - fee;

    // Sign transfers using vault PDA seeds
    let bounty_key = ctx.accounts.bounty.key();
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        bounty_key.as_ref(),
        &[bounty.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    // Transfer payout: vault → answerer (99%)
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.vault.to_account_info(),
                to:        ctx.accounts.answerer_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    // Transfer fee: vault → platform_fee_account (1%)
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault.to_account_info(),
                    to:        ctx.accounts.platform_fee_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    // Update bounty state
    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Awarded;
    bounty.answerer = ctx.accounts.answerer.key();

    emit!(BountyAwardedEvent {
        bounty:   ctx.accounts.bounty.key(),
        answerer: ctx.accounts.answerer.key(),
        payout,
        fee,
    });

    Ok(())
}

#[event]
pub struct BountyAwardedEvent {
    pub bounty:   Pubkey,
    pub answerer: Pubkey,
    pub payout:   u64,
    pub fee:      u64,
}
