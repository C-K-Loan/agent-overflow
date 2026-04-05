use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EscrowError;

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    /// Fee authority (Squads multisig on mainnet, dev wallet on devnet)
    pub authority: Signer<'info>,

    /// Fee vault PDA holding accumulated 1% fees
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    /// Authority's token account (receives fees)
    #[account(
        mut,
        constraint = authority_token_account.owner == authority.key(),
    )]
    pub authority_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimFees>) -> Result<()> {
    let amount = ctx.accounts.fee_vault.amount;
    require!(amount > 0, EscrowError::FeeVaultEmpty);

    let fee_vault_seeds: &[&[u8]] = &[
        FEE_VAULT_SEED,
        &[ctx.bumps.fee_vault],
    ];
    let signer_seeds = &[fee_vault_seeds];

    let cpi_transfer = Transfer {
        from: ctx.accounts.fee_vault.to_account_info(),
        to: ctx.accounts.authority_token_account.to_account_info(),
        authority: ctx.accounts.fee_vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_transfer,
            signer_seeds,
        ),
        amount,
    )?;

    emit!(FeesClaimedEvent {
        authority: ctx.accounts.authority.key(),
        amount,
    });

    Ok(())
}

#[event]
pub struct FeesClaimedEvent {
    pub authority: Pubkey,
    pub amount: u64,
}
