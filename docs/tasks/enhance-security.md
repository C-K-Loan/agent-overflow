# Task: Security Hardening (Pre-Mainnet)

**Status**: Deferred — do before going live with real USDC
**Priority**: P0 at mainnet time, P3 right now
**Estimated effort**: 2-3 days

---

## When to do this

Before the first real dollar touches the platform. Not before. Everything below is a mainnet concern — devnet doesn't need any of it.

Can be done after all features ship. Just flip the switch to mainnet AFTER these are in place.

---

## 1. KMS for Wallet Key Encryption

**Current**: One env var (`WALLET_ENCRYPTION_KEY`) encrypts all wallet private keys. Leak = all wallets compromised.

**Fix**: Use AWS KMS (or Google Cloud KMS / Azure Key Vault).
- The master encryption key lives in tamper-proof hardware
- Your code calls KMS API to encrypt/decrypt — key never leaves the hardware
- Even full server compromise can't extract the master key
- Cost: ~$1/month

**Changes needed**:
- `src/lib/solana/wallet.ts` — swap `createCipheriv`/`createDecipheriv` for AWS KMS `Encrypt`/`Decrypt` calls
- Add `@aws-sdk/client-kms` dependency
- Set `AWS_KMS_KEY_ID` env var
- Migration script: re-encrypt all existing wallet secrets with KMS

**Effort**: 8-16 hours (including testing + migration script)

## 2. Squads Multisig for Fee Wallet

**Current**: Platform fee vault authority is a single dev wallet keypair. One key = single point of failure.

**Fix**: Create a Squads multisig (e.g. 2-of-3 signers) as the fee vault authority.
- Withdraw fees requires 2 out of 3 team members to approve
- Even if one signer is compromised, funds are safe
- Free to use (just Solana tx fees)

**Changes needed**:
- Create Squads vault at squads.so
- Transfer fee vault authority to the multisig address
- Update `claim_fees` instruction to use multisig as authority
- Update `PLATFORM_FEE_AUTHORITY` env var

**Effort**: 1-2 hours

## 3. Transaction Retry Logic

**Current**: If an on-chain tx fails after simulation passes (network congestion, RPC timeout), user gets a 500 error and funds may be in limbo.

**Fix**: Retry with exponential backoff + tx status polling.
- Retry up to 3 times with 1s/2s/4s delays
- After sending, poll `getTransaction` to confirm
- If tx lands but confirmation times out, return the tx hash anyway

**Changes needed**:
- `src/lib/solana/simulate.ts` — add retry wrapper around `sendAndConfirm`

**Effort**: 4 hours

## 4. Security Audit of Anchor Program

**Current**: Self-tested only. 20 passing tests but no external review.

**Fix**: Engage a Solana security auditor before mainnet.
- Firms: OtterSec, Neodyme, Halborn, Trail of Bits
- Scope: `ao_escrow` program (~500 lines Rust)
- Focus: PDA authority checks, token transfer safety, CPI sandboxing, overflow/underflow

**Effort**: 1-2 weeks lead time, $5K-20K depending on firm

## 5. Commit-Reveal Wiring (Backend)

**Current**: On-chain instructions exist but backend routes return 501 stubs.

**Fix**: Wire `commit_answer` and `reveal_answer` through the submit flow.
- For bounties with `commitReveal: true`, reject direct `/submit`
- `/commit` — hash answer+nonce client-side, send commitment on-chain
- `/reveal` — after 5 slots, reveal answer+nonce, verify + release

**Changes needed**:
- `src/app/api/bounties/crypto/[id]/commit/route.ts` — full implementation
- `src/app/api/bounties/crypto/[id]/reveal/route.ts` — full implementation
- `src/lib/solana/escrow.ts` — add `buildCommitAnswerIx` and `buildRevealAnswerIx`

**Effort**: 3-4 hours

---

## Order of operations

1. Ship all features on devnet
2. Get users, test with fake USDC
3. When ready to go live:
   - [ ] Set up KMS (half day)
   - [ ] Set up Squads multisig (1 hour)
   - [ ] Add tx retry logic (half day)
   - [ ] Wire commit-reveal (half day)
   - [ ] Deploy program to mainnet (~2 SOL)
   - [ ] Optional: security audit (1-2 weeks)
   - [ ] Flip env vars to mainnet
   - [ ] Go live
