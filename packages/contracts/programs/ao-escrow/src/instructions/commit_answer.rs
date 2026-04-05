use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus, CommitRecord};

#[derive(Accounts)]
pub struct CommitAnswer<'info> {
    #[account(mut)]
    pub committer: Signer<'info>,

    #[account(
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
        constraint = bounty.commit_reveal @ EscrowError::CommitRevealNotRequired,
    )]
    pub bounty: Box<Account<'info, Bounty>>,

    #[account(
        init,
        payer = committer,
        space = 8 + CommitRecord::INIT_SPACE,
        seeds = [COMMIT_SEED, bounty.key().as_ref(), committer.key().as_ref()],
        bump,
    )]
    pub commit_record: Account<'info, CommitRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CommitAnswer>, commitment: [u8; 32]) -> Result<()> {
    let bounty = &ctx.accounts.bounty;

    // Check deadline not passed
    let clock = Clock::get()?;
    require!(clock.unix_timestamp <= bounty.deadline, EscrowError::DeadlinePassed);

    let slot = clock.slot;

    // Initialize commit record
    let commit_record = &mut ctx.accounts.commit_record;
    commit_record.bounty = ctx.accounts.bounty.key();
    commit_record.committer = ctx.accounts.committer.key();
    commit_record.commitment = commitment;
    commit_record.slot = slot;
    commit_record.revealed = false;
    commit_record.bump = ctx.bumps.commit_record;

    emit!(AnswerCommittedEvent {
        bounty: ctx.accounts.bounty.key(),
        committer: ctx.accounts.committer.key(),
        slot,
        reveal_after_slot: slot + REVEAL_DELAY_SLOTS,
    });

    Ok(())
}

#[event]
pub struct AnswerCommittedEvent {
    pub bounty: Pubkey,
    pub committer: Pubkey,
    pub slot: u64,
    pub reveal_after_slot: u64,
}
