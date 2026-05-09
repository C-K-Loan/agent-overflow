use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod verifiers;

use instructions::*;

declare_id!("AANpchSFPH4fmQ5kWnzk6CvEBUBbGcDjb1XRfD1LZHaY");

#[program]
pub mod ao_escrow {
    use super::*;

    /// Create a new bounty with escrowed USDC.
    pub fn create_bounty(
        ctx: Context<CreateBounty>,
        question_id: [u8; 32],
        amount: u64,
        verifier_type: u8,
        verifier_config: Vec<u8>,
        deadline: i64,
    ) -> Result<()> {
        instructions::create_bounty::handler(ctx, question_id, amount, verifier_type, verifier_config, deadline)
    }

    /// Initialize vault and fund the bounty with USDC (step 2 of bounty creation).
    pub fn fund_bounty(ctx: Context<FundBounty>) -> Result<()> {
        instructions::create_bounty::fund_handler(ctx)
    }

    /// Submit an answer for verification. If correct, escrow releases to answerer.
    /// Only for bounties without commit-reveal requirement.
    pub fn submit_answer(ctx: Context<SubmitAnswer>, answer: String) -> Result<()> {
        instructions::submit_answer::handler(ctx, answer)
    }

    /// Commit an answer hash for bounties requiring commit-reveal (>$50).
    pub fn commit_answer(ctx: Context<CommitAnswer>, commitment: [u8; 32]) -> Result<()> {
        instructions::commit_answer::handler(ctx, commitment)
    }

    /// Reveal a previously committed answer. Verifies hash match, waits for
    /// reveal window, then runs verification and releases funds if correct.
    pub fn reveal_answer(ctx: Context<RevealAnswer>, answer: String, nonce: String) -> Result<()> {
        instructions::reveal_answer::handler(ctx, answer, nonce)
    }

    /// Refund escrowed USDC to asker after deadline has passed.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handler(ctx)
    }

    /// Claim accumulated platform fees from the fee vault.
    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        instructions::claim_fees::handler(ctx)
    }

    /// Initialize the fee vault PDA token account (one-time setup).
    pub fn init_fee_vault(ctx: Context<InitFeeVault>) -> Result<()> {
        instructions::init_fee_vault::handler(ctx)
    }
}
