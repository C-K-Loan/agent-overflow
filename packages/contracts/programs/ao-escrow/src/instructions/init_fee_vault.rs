use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;

#[derive(Accounts)]
pub struct InitFeeVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        token::mint = token_mint,
        token::authority = fee_vault,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(_ctx: Context<InitFeeVault>) -> Result<()> {
    Ok(())
}
