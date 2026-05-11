use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus, VERIFIER_CONFIG_SIZE};

#[derive(Accounts)]
#[instruction(question_id: [u8; 32])]
pub struct CreateBounty<'info> {
    #[account(mut)]
    pub asker: Signer<'info>,

    #[account(
        init,
        payer = asker,
        space = 8 + Bounty::INIT_SPACE,
        seeds = [BOUNTY_SEED, question_id.as_ref(), asker.key().as_ref()],
        bump,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    /// The USDC mint
    pub token_mint: Account<'info, Mint>,

    /// Asker's USDC token account (source of funds)
    #[account(
        mut,
        constraint = asker_token_account.owner == asker.key() @ EscrowError::InsufficientBalance,
        constraint = asker_token_account.mint == token_mint.key() @ EscrowError::InvalidMint,
    )]
    pub asker_token_account: Account<'info, TokenAccount>,

    /// CHECK: Vault PDA — used as token account authority. We derive it and
    /// store the bump, but the actual token account is initialized separately
    /// via init_vault to avoid stack overflow.
    #[account(
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump,
    )]
    pub vault_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateBounty>,
    question_id: [u8; 32],
    amount: u64,
    verifier_type: u8,
    verifier_config: Vec<u8>,
    deadline: i64,
) -> Result<()> {
    // Validate amount
    require!(amount >= MIN_BOUNTY_AMOUNT, EscrowError::AmountBelowMinimum);
    require!(amount <= MAX_BOUNTY_AMOUNT, EscrowError::AmountExceedsMaximum);

    // Validate verifier type (0-7 built-in, 9 = zk_rust, 255 custom CPI)
    require!(
        verifier_type <= 7 || verifier_type == 9 || verifier_type == 255,
        EscrowError::UnknownVerifier
    );

    // Validate config size
    require!(
        verifier_config.len() <= VERIFIER_CONFIG_SIZE,
        EscrowError::ConfigTooLarge
    );

    // Validate deadline
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let duration = deadline - now;
    require!(
        duration >= MIN_DEADLINE_DURATION && duration <= MAX_DEADLINE_DURATION,
        EscrowError::InvalidDeadline
    );

    // Determine commit-reveal requirement
    let commit_reveal = amount > COMMIT_REVEAL_THRESHOLD;

    // Copy config into fixed-size array
    let config_len = verifier_config.len();
    let mut config_buf = [0u8; VERIFIER_CONFIG_SIZE];
    config_buf[..config_len].copy_from_slice(&verifier_config);

    // Initialize bounty account
    let bounty = &mut ctx.accounts.bounty;
    bounty.question_id = question_id;
    bounty.asker = ctx.accounts.asker.key();
    bounty.amount = amount;
    bounty.token_mint = ctx.accounts.token_mint.key();
    bounty.verifier_type = verifier_type;
    bounty.verifier_config = config_buf;
    bounty.verifier_config_len = config_len as u8;
    bounty.deadline = deadline;
    bounty.status = BountyStatus::Active;
    bounty.answerer = Pubkey::default();
    bounty.commit_reveal = commit_reveal;
    bounty.bump = ctx.bumps.bounty;
    bounty.vault_bump = ctx.bumps.vault_authority;
    bounty.created_at = now;

    emit!(BountyCreatedEvent {
        bounty: ctx.accounts.bounty.key(),
        question_id,
        asker: ctx.accounts.asker.key(),
        amount,
        verifier_type,
        deadline,
        commit_reveal,
    });

    Ok(())
}

/// Second instruction: initialize vault token account and fund it.
/// Split from create_bounty to avoid BPF stack overflow.
#[derive(Accounts)]
pub struct FundBounty<'info> {
    #[account(mut)]
    pub asker: Signer<'info>,

    #[account(
        mut,
        constraint = bounty.asker == asker.key(),
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = asker_token_account.owner == asker.key(),
        constraint = asker_token_account.mint == token_mint.key() @ EscrowError::InvalidMint,
    )]
    pub asker_token_account: Account<'info, TokenAccount>,

    /// Vault PDA token account (initialized here)
    #[account(
        init,
        payer = asker,
        token::mint = token_mint,
        token::authority = vault,
        seeds = [VAULT_SEED, bounty.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn fund_handler(ctx: Context<FundBounty>) -> Result<()> {
    let amount = ctx.accounts.bounty.amount;

    // Transfer USDC from asker to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.asker_token_account.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.asker.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    Ok(())
}

#[event]
pub struct BountyCreatedEvent {
    pub bounty: Pubkey,
    pub question_id: [u8; 32],
    pub asker: Pubkey,
    pub amount: u64,
    pub verifier_type: u8,
    pub deadline: i64,
    pub commit_reveal: bool,
}
