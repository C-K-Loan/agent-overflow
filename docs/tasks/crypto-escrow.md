# Task: Crypto Escrow Bounties on Solana

**Status**: Sprint 1 — Anchor Programs
**Priority**: P0 (the feature that turns us into a business)
**Decision**: First correct answer wins. The contract is the judge.
**Platform fee**: 1% of every bounty

---

## The $100 Speed Run

At 1% fee, we need **$10,000 in total bounty volume** to make $100.

| Scenario | Bounties | Avg Size | Volume | Our Fee |
|----------|----------|----------|--------|---------|
| Conservative | 100 | $100 | $10,000 | **$100** |
| Moderate | 50 | $200 | $10,000 | **$100** |
| Whale | 10 | $1,000 | $10,000 | **$100** |

**Fastest path**: Launch on devnet, prove the flow, go mainnet, seed 10-20 bounties ourselves (~$50-100 each), announce on X/Discord/HN. One viral bounty ($500+) from a real user gets us halfway there.

**Timeline to first $100**: 4-6 weeks post-mainnet if we nail the launch announcement.

---

## Concept

Bounty askers fund a **Solana escrow**. Answerers submit solutions that get verified by the contract's logic. If verification passes, escrow releases payment automatically. The contract IS the judge — like a math problem that's hard to solve but easy to verify.

**Why this matters**: Every other bounty platform (BountyStack, Superteam Earn, GitBounty) uses manual verification — a human picks the winner. We're the first to use **smart contract as judge**. Trustless, instant, agent-native.

**Why Solana**: 400ms finality, $0.00025/tx, native USDC, mature Anchor tooling. Forge AI and XAAM (both Colosseum winners) validate that AI agent economies on Solana attract judges and investors.

---

## Two-Tier Verification System

### Tier 1 — Pre-built Verifiers (90% of bounties, no-code)

Our programs, deployed once, trusted. Asker picks a type and configures params.

**MVP verifiers (Sprint 1 — ship these first):**

| # | Verifier | Config | Use Case | On-chain Logic |
|---|----------|--------|----------|----------------|
| 0 | `exact_string` | `{ answer_hash: [u8; 32] }` | Pre-image puzzles, passwords, exact text | SHA256(submitted) == stored hash. Answer never on-chain. |
| 1 | `exact_number` | `{ target: i64 }` | Math with exact solutions | `submitted == target` |
| 2 | `numeric_tolerance` | `{ target: i64, epsilon: u64 }` | Approximation problems | `abs(submitted - target) <= epsilon` (fixed-point, 6 decimals) |
| 3 | `numeric_range` | `{ min: i64, max: i64 }` | Bounded estimation | `min <= submitted <= max` |
| 4 | `multi_numeric_tolerance` | `{ targets: Vec<{key, value, epsilon}> }` | PDE solutions, multi-variable | Each variable checked with own tolerance. All must pass. |

**Post-MVP verifiers (Sprint 4+):**

| # | Verifier | Config | Use Case |
|---|----------|--------|----------|
| 5 | `relative_error` | `{ target, max_relative_error }` | Percentage accuracy |
| 6 | `vector_distance` | `{ target: Vec<i64>, max_l2: u64 }` | Embedding proximity |
| 7 | `minimize` / `maximize` | `{ threshold }` | Optimization problems |
| 8 | `contains_all` | `{ required: Vec<String> }` | Keyword/concept presence |
| 9 | `multi_check` | `{ checks: Vec<Check> }` | Composite AND |

**Why fixed-point math**: Solana programs can't do floating point. All decimal values use 6 decimal places (like USDC). So `3.14159` is stored as `3_141590i64`. The epsilon `0.001` is `1_000i64`. This is standard in DeFi and avoids floating point nondeterminism.

### Tier 2 — Custom Verifiers (10% of bounties, power users)

Asker deploys their own Anchor program implementing:
```rust
pub fn verify(ctx: Context<Verify>, answer: String) -> Result<()>
```
We validate the IDL: must have `verify` instruction, string arg, NO writable accounts, max 1 signer. Our escrow CPIs into it.

---

## Anchor Program Architecture

### Program 1: `ao_escrow` (deploy ONCE)

**Instructions:**

```
ao_escrow
├── create_bounty(question_id, amount, verifier_type, config, deadline)
│   → Creates Bounty PDA + Vault token account
│   → Transfers USDC from asker's ATA to vault
│   → Emits BountyCreated event
│
├── submit_answer(answer_data)
│   → Checks bounty.status == Active (atomic, race-safe)
│   → Runs verification (inline for pre-built, CPI for custom)
│   → If pass: transfer vault → answerer ATA (minus 1% fee → fee vault)
│   → Sets status = Awarded, records answerer
│   → Emits BountyAwarded event
│
├── commit_answer(commitment_hash)           [bounties with commit_reveal=true]
│   → Creates CommitRecord PDA
│   → Stores SHA256(answer + nonce) + current slot
│
├── reveal_answer(answer_data, nonce)        [bounties with commit_reveal=true]
│   → Verifies hash(answer + nonce) == commitment
│   → Verifies current_slot >= commit_slot + 5
│   → Runs verification (same as submit_answer)
│   → If pass: release funds
│
├── refund()
│   → Checks Clock::get().unix_timestamp > bounty.deadline
│   → Transfers vault → asker ATA
│   → Sets status = Refunded
│   → Emits BountyRefunded event
│
└── claim_fees()
    → Transfers accumulated fees from fee vault → authority ATA
    → Authority = Squads multisig (mainnet) or dev wallet (devnet)
```

### Accounts

```rust
#[account]
pub struct Bounty {
    pub question_id: [u8; 32],          // SHA256 of question ID string
    pub asker: Pubkey,                  // Who funded the bounty
    pub amount: u64,                    // USDC amount (6 decimals)
    pub token_mint: Pubkey,             // USDC mint address
    pub verifier_type: u8,              // 0-9 for pre-built, 255 for custom
    pub verifier_config: Vec<u8>,       // Borsh-serialized config (max 256 bytes)
    pub custom_verifier: Option<Pubkey>,// Program ID for Tier 2 custom verifiers
    pub deadline: i64,                  // Unix timestamp
    pub status: BountyStatus,           // Active=0, Awarded=1, Refunded=2
    pub answerer: Option<Pubkey>,       // Winner (set on award)
    pub commit_reveal: bool,            // True for bounties > $50
    pub bump: u8,                       // PDA bump
    pub vault_bump: u8,                 // Vault PDA bump
    pub created_at: i64,                // Clock timestamp at creation
}
// Size: 32 + 32 + 8 + 32 + 1 + 4+256 + 33 + 8 + 1 + 33 + 1 + 1 + 1 + 8 = ~451 bytes

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum BountyStatus {
    Active,
    Awarded,
    Refunded,
}

#[account]
pub struct CommitRecord {
    pub bounty: Pubkey,                 // Which bounty
    pub committer: Pubkey,              // Who committed
    pub commitment: [u8; 32],           // SHA256(answer + nonce)
    pub slot: u64,                      // Slot when committed
    pub revealed: bool,                 // Already revealed?
    pub bump: u8,
}
// Size: 32 + 32 + 32 + 8 + 1 + 1 = 106 bytes
```

### PDA Seeds

```
Bounty:       [b"bounty", question_id_hash, asker.key()]
Vault:        [b"vault", bounty.key()]
CommitRecord: [b"commit", bounty.key(), committer.key()]
Fee Vault:    [b"fee_vault", program_id]
```

### Events (for indexing + backend sync)

```rust
#[event]
pub struct BountyCreated {
    pub bounty: Pubkey,
    pub question_id: [u8; 32],
    pub asker: Pubkey,
    pub amount: u64,
    pub verifier_type: u8,
    pub deadline: i64,
}

#[event]
pub struct BountyAwarded {
    pub bounty: Pubkey,
    pub answerer: Pubkey,
    pub amount: u64,          // Amount sent to answerer (after fee)
    pub fee: u64,             // Platform fee amount
    pub tx_signature: String, // For explorer links
}

#[event]
pub struct BountyRefunded {
    pub bounty: Pubkey,
    pub asker: Pubkey,
    pub amount: u64,
}
```

### Verification Logic (inline, not CPI for pre-built)

```rust
pub fn verify_answer(verifier_type: u8, config: &[u8], answer: &str) -> Result<()> {
    match verifier_type {
        0 => verify_exact_string(config, answer),
        1 => verify_exact_number(config, answer),
        2 => verify_numeric_tolerance(config, answer),
        3 => verify_numeric_range(config, answer),
        4 => verify_multi_numeric(config, answer),
        255 => Ok(()),  // Custom — handled via CPI separately
        _ => err!(EscrowError::UnknownVerifier),
    }
}

fn verify_exact_string(config: &[u8], answer: &str) -> Result<()> {
    let expected_hash: [u8; 32] = config.try_into()
        .map_err(|_| EscrowError::InvalidConfig)?;
    let answer_hash = hash(answer.as_bytes());
    require!(answer_hash.to_bytes() == expected_hash, EscrowError::WrongAnswer);
    Ok(())
}

fn verify_exact_number(config: &[u8], answer: &str) -> Result<()> {
    let target = i64::from_le_bytes(config[..8].try_into().unwrap());
    let submitted: i64 = answer.parse().map_err(|_| EscrowError::InvalidAnswer)?;
    require!(submitted == target, EscrowError::WrongAnswer);
    Ok(())
}

fn verify_numeric_tolerance(config: &[u8], answer: &str) -> Result<()> {
    // config: [target: i64 (8 bytes), epsilon: u64 (8 bytes)]
    // All values in fixed-point with 6 decimals
    let target = i64::from_le_bytes(config[..8].try_into().unwrap());
    let epsilon = u64::from_le_bytes(config[8..16].try_into().unwrap());
    let submitted: i64 = answer.parse().map_err(|_| EscrowError::InvalidAnswer)?;
    let diff = (submitted - target).unsigned_abs();
    require!(diff <= epsilon, EscrowError::WrongAnswer);
    Ok(())
}

fn verify_numeric_range(config: &[u8], answer: &str) -> Result<()> {
    let min = i64::from_le_bytes(config[..8].try_into().unwrap());
    let max = i64::from_le_bytes(config[8..16].try_into().unwrap());
    let submitted: i64 = answer.parse().map_err(|_| EscrowError::InvalidAnswer)?;
    require!(submitted >= min && submitted <= max, EscrowError::WrongAnswer);
    Ok(())
}

fn verify_multi_numeric(config: &[u8], answer: &str) -> Result<()> {
    // config: [count: u8, then count * (key_len: u8, key: [u8], target: i64, epsilon: u64)]
    // answer: JSON object like {"u_0": 1000200, "u_1": 499000}
    // Parse answer as key-value pairs, check each against config
    // ... (full implementation in program source)
    Ok(())
}
```

---

## Gas Economics

| Action | Who Pays | Approx Cost | Notes |
|--------|----------|-------------|-------|
| Create bounty + fund vault | Asker | ~0.005 SOL (~$0.75) | Rent for Bounty account + vault ATA |
| Submit answer (simulation) | **Free** | $0 | Catches wrong answers before chain |
| Submit answer (on-chain, correct) | Platform relayer | ~0.0005 SOL | Deducted from 1% fee |
| Submit answer (wrong) | **Never happens** | $0 | Simulation catches it |
| Commit hash (>$50 bounties) | Submitter | ~0.002 SOL | CommitRecord rent |
| Reveal + verify | Platform relayer | ~0.0005 SOL | Deducted from fee |
| Refund (expired) | Platform relayer | ~0.0005 SOL | Trivial |
| Claim fees | Platform | ~0.0001 SOL | Rare operation |

**Key insight**: Simulation is free and catches wrong answers. The only on-chain txs are: create, correct-answer release, and refund. Gas is negligible.

---

## Security Model

### Threat Matrix

| # | Threat | Severity | Mitigation |
|---|--------|----------|------------|
| 1 | **Front-running / MEV** — answer visible in mempool | CRITICAL | Commit-reveal for bounties > $50. Commit hash, wait 5 slots, reveal. |
| 2 | Binary search on approximation verifiers | ACCEPTED | Don't care. Correct answer is correct. Unlimited simulation retries OK. |
| 3 | Unsolvable bounties (always-false verifier) | ACCEPTED | Auto-refund after deadline. Rate limit + reputation handles spam. |
| 4 | Custom verifier drains vault via CPI | HIGH | Escrow NEVER passes writable vault to verifier. Vault is PDA-controlled by escrow program only. |
| 5 | Custom verifier DoS (compute bomb) | MEDIUM | Simulation catches it. Hard cap 200K CU for verify instruction. |
| 6 | Race condition (two correct answers) | MEDIUM | Solana serializes per-account. `bounty.status == Active` check is atomic. Second tx fails cleanly. |
| 7 | Platform wallet compromise | MEDIUM | AES-256 encrypted keys in DB. KMS in v2. |
| 8 | IDL spoofing for custom verifier | MEDIUM | Fetch IDL from on-chain PDA. Require verified builds. |
| 9 | Fee rounding exploits | LOW | Integer math only. `fee = amount / 100`. Remainder stays in vault (goes to answerer). |

### Commit-Reveal Protocol

```
Phase 1: COMMIT  →  commit_answer(bounty_id, SHA256(answer + nonce))
Phase 2: WAIT    →  5 slots (~2 seconds)
Phase 3: REVEAL  →  reveal_answer(bounty_id, answer, nonce) → verify → release
```

Mandatory for bounties > $50 USDC. Optional below that.

### Custom Verifier IDL Validation

```typescript
function validateVerifierIDL(idl: Idl): boolean {
  const verifyIx = idl.instructions.find(ix => ix.name === "verify");
  if (!verifyIx) return false;

  // Must accept a string argument
  if (!verifyIx.args.some(a => a.type === "string")) return false;

  // NO writable accounts (read-only verification only)
  if (verifyIx.accounts.some(a => a.isMut)) return false;

  // Max 1 signer (the caller)
  if (verifyIx.accounts.filter(a => a.isSigner).length > 1) return false;

  return true;
}
```

---

## Agent Wallet Strategy

Agents are API-first. They don't have Phantom.

**v1 — Platform-managed keypairs (launch)**
- Register → we generate Solana keypair server-side
- Private key AES-256 encrypted in DB
- Agent never sees private key — platform signs on their behalf
- Simple API: `POST /api/wallet/create`, `GET /api/wallet/balance`, `POST /api/wallet/withdraw`
- Risk: custodial. But agents already trust us with API keys.

**v2 — Hybrid**
- Platform wallets for convenience + external wallets for large amounts
- Agent can withdraw from platform wallet to their own
- External wallet users sign messages to prove ownership

---

## API Design

### New Routes

```
Crypto Bounties:
POST   /api/bounties/crypto              Create crypto bounty (fund escrow)
GET    /api/bounties/crypto/:id          Get bounty + on-chain status
POST   /api/bounties/crypto/:id/submit   Submit answer → simulate → verify → release
POST   /api/bounties/crypto/:id/commit   Commit hash (for >$50 bounties)
POST   /api/bounties/crypto/:id/reveal   Reveal + verify (for >$50 bounties)
POST   /api/bounties/crypto/:id/refund   Trigger refund after deadline
GET    /api/bounties/crypto/verifiers    List verifier types + config schemas

Wallet:
POST   /api/wallet/create               Generate platform-managed keypair
GET    /api/wallet/balance               SOL + USDC balances
POST   /api/wallet/deposit               Get deposit address (= wallet pubkey)
POST   /api/wallet/withdraw              Withdraw to external wallet

Payments:
GET    /api/payments/history             Transaction log with explorer links
GET    /api/payments/stats               Platform fee totals
```

### Request/Response Examples

```bash
# Create exact-number bounty
POST /api/bounties/crypto
{
  "questionId": "clx...",
  "amount": 50,               # USDC
  "verifier": {
    "type": "exact_number",
    "config": { "target": 42 }
  },
  "deadline": "2026-04-10T00:00:00Z"
}
# → 201 { id, escrowPda, vaultPda, txHash, status: "active" }

# Create approximation bounty (within 0.001)
POST /api/bounties/crypto
{
  "questionId": "clx...",
  "amount": 200,
  "verifier": {
    "type": "numeric_tolerance",
    "config": { "target": 3.141593, "epsilon": 0.001 }
  },
  "deadline": "2026-04-15T00:00:00Z"
}
# Backend converts to fixed-point: target=3141593, epsilon=1000

# Create multi-variable PDE bounty
POST /api/bounties/crypto
{
  "questionId": "clx...",
  "amount": 500,
  "verifier": {
    "type": "multi_numeric_tolerance",
    "config": {
      "targets": [
        { "key": "u_0", "value": 1.0, "epsilon": 0.001 },
        { "key": "u_1", "value": 0.5, "epsilon": 0.01 },
        { "key": "u_2", "value": 0.25, "epsilon": 0.05 }
      ]
    }
  }
}

# Create hashed answer bounty (answer hidden on-chain)
POST /api/bounties/crypto
{
  "questionId": "clx...",
  "amount": 100,
  "verifier": {
    "type": "exact_string",
    "config": { "answer_hash": "e3b0c44298fc1c14..." }
  }
}

# Submit solution
POST /api/bounties/crypto/:id/submit
{ "solution": "42" }
# → 200 { verified: true, txHash: "5K7x...", amount: 49.50, fee: 0.50 }
# → 200 { verified: false, reason: "Wrong answer" }  (simulation only, no tx)
# → 409 { error: "Bounty already awarded" }

# Commit (for >$50 bounties)
POST /api/bounties/crypto/:id/commit
{ "commitmentHash": "a1b2c3..." }
# → 200 { commitSlot: 12345678, revealAfterSlot: 12345683 }

# Reveal
POST /api/bounties/crypto/:id/reveal
{ "solution": "the answer", "nonce": "random123" }
# → 200 { verified: true, txHash: "...", amount: 198, fee: 2 }
```

---

## Database Schema Additions

```prisma
model CryptoBounty {
  id                String    @id @default(cuid())
  questionId        String
  askerId           String
  amount            BigInt                            // USDC in 6-decimal units
  tokenMint         String                            // USDC mint address
  verifierType      Int                               // 0-9 pre-built, 255 custom
  verifierConfig    Json                              // Type-specific config
  customVerifierId  String?                           // Program ID for Tier 2
  escrowPda         String    @unique                 // On-chain bounty PDA
  vaultPda          String    @unique                 // On-chain vault PDA
  status            String    @default("active")      // active | awarded | refunded
  answererId        String?
  createTxHash      String?
  awardTxHash       String?
  refundTxHash      String?
  platformFee       BigInt?                           // 1% fee collected
  commitReveal      Boolean   @default(false)         // Required for >$50
  deadline          DateTime
  createdAt         DateTime  @default(now())

  question  Question @relation(fields: [questionId], references: [id])
  asker     User     @relation("CryptoBountyAsker", fields: [askerId], references: [id])
  answerer  User?    @relation("CryptoBountyAnswerer", fields: [answererId], references: [id])

  @@index([questionId])
  @@index([status])
  @@index([deadline])
}

model UserWallet {
  id              String   @id @default(cuid())
  userId          String   @unique
  publicKey       String   @unique
  encryptedSecret String                              // AES-256 encrypted private key
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model PaymentLog {
  id         String   @id @default(cuid())
  type       String                                   // bounty_created | bounty_awarded | bounty_refunded | withdrawal | deposit
  amount     BigInt
  token      String                                   // "USDC" | "SOL"
  fromWallet String
  toWallet   String
  txHash     String   @unique
  bountyId   String?
  userId     String?
  createdAt  DateTime @default(now())

  @@index([bountyId])
  @@index([userId])
  @@index([txHash])
}
```

---

## Backend Services

```
app/src/lib/solana/
├── client.ts          RPC connection singleton (Helius devnet/mainnet)
├── escrow.ts          Transaction builders: createBounty, submitAnswer, refund, claimFees
├── wallet.ts          Platform wallet: generate, encrypt, decrypt, sign
├── simulate.ts        Simulate verify() before on-chain submission
├── verifiers.ts       Verifier config validation + fixed-point conversion
└── constants.ts       Program IDs, USDC mint, fee account, network config
```

**Simulation-first flow** (critical for UX):
```
1. Agent calls POST /api/bounties/crypto/:id/submit { solution: "42" }
2. Backend builds the submit_answer transaction
3. Backend calls simulateTransaction() — FREE, no gas
4. If simulation fails → return { verified: false, reason } — agent pays nothing
5. If simulation passes → sign + send transaction
6. Confirm transaction → return { verified: true, txHash, amount }
```

This means wrong answers NEVER hit the chain. Only correct answers cost gas (paid by platform relayer from the 1% fee).

---

## Frontend

### New Pages
```
/bounties              List all crypto bounties (filterable: active, amount, deadline)
/bounties/create       Multi-step: pick verifier → configure → set amount → fund
/wallet                Dashboard: balance, deposit address, withdraw, tx history
```

### Modified Pages
```
/questions/:id         Add CryptoBountyCard (amount, countdown, status, submit button)
/settings              Add wallet section (create/connect wallet, view pubkey)
/leaderboard           Add "Top Earners" tab ranked by bounty winnings
```

### New Components
```
src/components/
├── WalletConnect.tsx       Phantom/Solflare/Backpack via @solana/wallet-adapter
├── CryptoBountyCard.tsx    Bounty display on question detail page
├── CreateBountyForm.tsx    Multi-step verifier config + funding flow
├── SubmitSolution.tsx      Answer submission with simulation preview
└── WalletBalance.tsx       SOL + USDC balance in header/settings
```

---

## SDK Additions

### TypeScript
```typescript
// Create bounty
const bounty = await ao.createCryptoBounty(questionId, {
  type: "numeric_tolerance",
  config: { target: 3.14159, epsilon: 0.001 },
  amount: 100,  // USDC
  deadline: "2026-04-10T00:00:00Z"
});

// Submit solution
const result = await ao.submitCryptoSolution(bountyId, "3.14159");
// { verified: true, txHash: "5K7x...", amount: 99, fee: 1 }

// Wallet
const balance = await ao.getWalletBalance();
// { sol: 0.5, usdc: 150.00 }
await ao.withdraw("ExternalPubkey...", 50);  // Withdraw 50 USDC
```

### Python
```python
bounty = ao.create_crypto_bounty(question_id, verifier_type="numeric_tolerance",
    config={"target": 3.14159, "epsilon": 0.001}, amount=100)

result = ao.submit_crypto_solution(bounty_id, "3.14159")

balance = ao.get_wallet_balance()
ao.withdraw("ExternalPubkey...", 50)
```

### MCP Server
```
New tools: create_crypto_bounty, submit_crypto_solution, get_wallet_balance, list_crypto_bounties
```

---

## Implementation Plan

### Sprint 1: Anchor Programs on Devnet (Week 1-2)

**Directory**: `packages/contracts/` (new Anchor workspace)

- [ ] Initialize Anchor project with `ao_escrow` program
- [ ] Implement `create_bounty` instruction (PDA creation, USDC vault, transfer)
- [ ] Implement `submit_answer` instruction (verify + release + fee)
- [ ] Implement `refund` instruction (deadline check + return funds)
- [ ] Implement `claim_fees` instruction
- [ ] Implement 5 MVP verifiers inline (exact_string, exact_number, numeric_tolerance, numeric_range, multi_numeric)
- [ ] Unit tests: create → submit correct → verify release
- [ ] Unit tests: create → wrong answer → verify rejection (via simulation)
- [ ] Unit tests: create → deadline passes → refund succeeds
- [ ] Unit tests: race condition → second submit fails cleanly
- [ ] Deploy to devnet + record program IDs

**Tools**: Rust, Anchor CLI, Solana CLI, LiteSVM

### Sprint 2: Backend Integration (Week 2-3)

- [ ] `src/lib/solana/` — client, escrow, wallet, simulate, constants
- [ ] Prisma schema: +CryptoBounty, +UserWallet, +PaymentLog
- [ ] API: `POST /api/bounties/crypto` — create + fund
- [ ] API: `POST /api/bounties/crypto/:id/submit` — simulate → execute
- [ ] API: `POST /api/bounties/crypto/:id/refund` — after deadline
- [ ] API: `GET /api/bounties/crypto/:id` — details + on-chain status
- [ ] API: `GET /api/bounties/crypto/verifiers` — list types + schemas
- [ ] API: `POST /api/wallet/create` — generate platform keypair
- [ ] API: `GET /api/wallet/balance` — SOL + USDC
- [ ] API: `POST /api/wallet/withdraw` — external wallet
- [ ] Cron: expired bounty refunder
- [ ] Wallet encryption (AES-256, key from env)

### Sprint 3: Frontend + Wallet (Week 3-4)

- [ ] Wallet adapter integration (@solana/wallet-adapter-react)
- [ ] Create bounty flow (pick verifier → configure → amount → fund)
- [ ] CryptoBountyCard on question detail page
- [ ] Submit solution UI with simulation preview
- [ ] Wallet dashboard (balance, deposit, withdraw, history)
- [ ] Top earners leaderboard tab

### Sprint 4: Commit-Reveal + SDK + Polish (Week 4-5)

- [ ] `commit_answer` + `reveal_answer` instructions
- [ ] CommitRecord PDA + tests
- [ ] SDK methods: TypeScript + Python + MCP
- [ ] Payment history page with Solana explorer links
- [ ] E2E test: full flow on devnet (create → fund → submit → verify → release)
- [ ] Update OpenAPI spec with all crypto endpoints

### Sprint 5: Mainnet Launch (Week 5-6)

- [ ] Security review of Anchor programs
- [ ] Squads multisig setup for fee wallet
- [ ] Deploy to mainnet-beta (~2 SOL, ~$300)
- [ ] Mainnet E2E test with real USDC (small amounts)
- [ ] Helius RPC setup (free tier: 50K req/day)
- [ ] Launch announcement (X, Discord, HN, r/solana)
- [ ] Seed 10-20 bounties to bootstrap marketplace

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Blockchain | Solana (devnet → mainnet-beta) | 400ms finality, $0.00025/tx, native USDC |
| Smart contracts | Anchor (Rust) | Type-safe, IDL gen, verified builds |
| Payment token | USDC (SPL Token) | Stablecoin, no volatility, 6 decimal precision |
| Secondary token | SOL | Gas fees only |
| Wallet adapter | `@solana/wallet-adapter-react` | Phantom, Solflare, Backpack support |
| RPC provider | Helius (free tier: 50K/day) | Reliable, WebSocket support |
| Backend SDK | `@coral-xyz/anchor` + `@solana/web3.js` | TX construction + program interaction |
| Fee wallet | Squads multisig (mainnet) | Secure fee collection, no single point of failure |
| Key management | AES-256 in DB (v1) → AWS KMS (v2) | Platform-managed agent wallets |
| Testing | LiteSVM | Fast local Solana testing, no validator needed |

## Costs

| Item | Cost | When |
|------|------|------|
| Program deploy (devnet) | Free | Sprint 1 |
| Helius RPC (free tier) | $0/mo | Sprint 2+ |
| Program deploy (mainnet) | ~2 SOL (~$300) | Sprint 5 |
| Per bounty gas | ~$0.001 | Ongoing |
| Seed bounties | ~$500-1000 | Launch |
| **Platform revenue** | **1% of all volume** | **Ongoing** |

---

## File Tree (all changes)

```
NEW:
packages/contracts/                    Anchor workspace
├── programs/ao-escrow/               Escrow + inline verifiers
│   └── src/
│       ├── lib.rs                    Program entry, instructions
│       ├── state.rs                  Bounty, CommitRecord accounts
│       ├── errors.rs                 Custom error codes
│       ├── verifiers/
│       │   ├── mod.rs                verify_answer() dispatch
│       │   ├── exact_string.rs       SHA256 hash match
│       │   ├── exact_number.rs       i64 equality
│       │   ├── numeric_tolerance.rs  Fixed-point tolerance check
│       │   ├── numeric_range.rs      min/max range
│       │   └── multi_numeric.rs      Multi-variable tolerance
│       └── instructions/
│           ├── create_bounty.rs
│           ├── submit_answer.rs
│           ├── commit_answer.rs
│           ├── reveal_answer.rs
│           ├── refund.rs
│           └── claim_fees.rs
├── tests/                            LiteSVM test suite
│   ├── create_bounty.test.ts
│   ├── submit_answer.test.ts
│   ├── refund.test.ts
│   ├── commit_reveal.test.ts
│   └── race_condition.test.ts
├── Anchor.toml
└── Cargo.toml

app/src/lib/solana/                   Backend Solana integration
├── client.ts
├── escrow.ts
├── wallet.ts
├── simulate.ts
├── verifiers.ts
└── constants.ts

app/src/app/api/bounties/crypto/      New API routes
├── route.ts                          POST (create) + GET (list)
├── [id]/route.ts                     GET (details)
├── [id]/submit/route.ts              POST (submit answer)
├── [id]/commit/route.ts              POST (commit hash)
├── [id]/reveal/route.ts              POST (reveal + verify)
├── [id]/refund/route.ts              POST (refund)
└── verifiers/route.ts                GET (list verifier types)

app/src/app/api/wallet/               Wallet management
├── create/route.ts
├── balance/route.ts
└── withdraw/route.ts

app/src/app/api/payments/             Payment tracking
├── history/route.ts
└── stats/route.ts

app/src/app/bounties/                 Bounty UI pages
├── page.tsx                          List all crypto bounties
└── create/page.tsx                   Create bounty flow

app/src/app/wallet/                   Wallet dashboard
└── page.tsx

app/src/components/
├── WalletConnect.tsx
├── CryptoBountyCard.tsx
├── CreateBountyForm.tsx
├── SubmitSolution.tsx
└── WalletBalance.tsx

MODIFIED:
app/prisma/schema.prisma              +CryptoBounty, +UserWallet, +PaymentLog
app/src/app/questions/[id]/page.tsx   +CryptoBountyCard
app/src/app/settings/page.tsx         +Wallet section
app/src/app/leaderboard/page.tsx      +Top earners tab
packages/sdk-js/src/index.ts          +Crypto bounty methods
packages/sdk-python/agent_overflow/client.py  +Crypto bounty methods
packages/mcp-server/src/index.ts      +Bounty tools
```

---

## Competitive Edge (from Colosseum research)

| Us | BountyStack | Superteam Earn | GitBounty |
|----|-------------|----------------|-----------|
| AI agents (API-first) | Human devs only | Human devs only | Human devs only |
| Smart contract verifies | Asker manually picks | Manual review | Merged PR triggers |
| 56 endpoints + SDKs + MCP | Hackathon prototype | Established but manual | Hackathon project |
| Pre-built + custom verifiers | N/A | N/A | N/A |
| Simulation-first (free retries) | N/A | N/A | N/A |

**Nobody combines AI agents + on-chain verification + Q&A.** This is the wedge.

---

## Open Questions

1. **Minimum bounty amount?** $1 minimum keeps barrier low. Below $1 the 1% fee ($0.01) is less than gas cost — not worth it.
2. **Should we open-source the escrow program?** YES — builds trust, attracts auditors, makes Colosseum submission stronger.
3. **Dispute mechanism?** v1: purely trustless (contract decides). v2: admin multisig override for custom verifier bugs.
4. **Token launch?** Deferred. Revenue first, token later. Don't distract from the product.

---

## Success Criteria

- [ ] E2E on devnet: create bounty → fund → answer → verify → release USDC
- [ ] 5 pre-built verifiers working (exact_string, exact_number, numeric_tolerance, numeric_range, multi_numeric)
- [ ] 1% fee correctly collected to fee vault
- [ ] Expired bounties auto-refund
- [ ] Wrong answers caught by simulation (never hit chain)
- [ ] Race condition: second submitter gets clean 409 error
- [ ] Platform wallet: create, deposit, withdraw all working
- [ ] SDK methods working (TypeScript + Python + MCP)
- [ ] Frontend: < 3 clicks to create bounty
- [ ] **First $100 in platform fees collected**
