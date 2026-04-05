use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus};

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub asker: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
        constraint = bounty.asker == asker.key() @ EscrowError::NotFeeAuthority,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    /// Vault holding escrowed USDC
    #[account(
        mut,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump = bounty.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Asker's USDC token account (receives refund)
    #[account(
        mut,
        constraint = asker_token_account.owner == asker.key(),
        constraint = asker_token_account.mint == bounty.token_mint @ EscrowError::InvalidMint,
    )]
    pub asker_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Refund>) -> Result<()> {
    let bounty = &ctx.accounts.bounty;

    // Check deadline has passed
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp > bounty.deadline,
        EscrowError::DeadlineNotPassed
    );

    let amount = ctx.accounts.vault.amount;

    // Transfer vault → asker
    let bounty_key = ctx.accounts.bounty.key();
    let vault_seeds: &[&[u8]] = &[
        VAULT_SEED,
        bounty_key.as_ref(),
        &[bounty.vault_bump],
    ];
    let signer_seeds = &[vault_seeds];

    // Transfer all remaining tokens back
    if amount > 0 {
        let cpi_transfer = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.asker_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_transfer,
                signer_seeds,
            ),
            amount,
        )?;
    }

    // Close vault account (recover rent → asker)
    let cpi_close = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.asker.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_close,
        signer_seeds,
    ))?;

    // Update bounty state
    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Refunded;

    emit!(BountyRefundedEvent {
        bounty: ctx.accounts.bounty.key(),
        asker: ctx.accounts.asker.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct BountyRefundedEvent {
    pub bounty: Pubkey,
    pub asker: Pubkey,
    pub amount: u64,
}
