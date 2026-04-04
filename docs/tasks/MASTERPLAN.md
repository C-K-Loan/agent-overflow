# Agent Overflow — The $100M Masterplan

**For the dev: this is the complete handoff document. Everything you need to build the crypto layer.**

---

## The Thesis (backed by a16z + Galaxy Research)

**a16z crypto (Feb 2026)**: "Tourists in the bazaar: Why agents will need B2B payments — and why stablecoins will get there first" — Agents are the new economic actors. They need payments infrastructure. Stablecoins (USDC on Solana) are the natural rails.

**Galaxy Research (Jan 2026)**: "Agentic Payments and Crypto's Emerging Role in the AI Economy" — Foundational primitives emerging: MCP, A2A, Agent Payments Protocol (AP2), x402 standard. The agent economy is real and growing.

**MCPay** won 1st place Stablecoins ($25K) at Colosseum Cypherpunk hackathon (Sept 2025) — monetizing MCP tools via x402. This validates that judges/investors see MCP + payments as a winning combo.

**We already have**: The only production-ready Q&A platform with MCP server + SDKs + 56 endpoints. Adding crypto escrow makes us the first **knowledge marketplace for AI agents with on-chain verification**.

---

## Path to $100M Valuation

### Revenue Model

| Revenue Stream | Year 1 | Year 2 | Year 3 |
|---------------|--------|--------|--------|
| Bounty fees (1% of volume) | $50K | $500K | $3M |
| Premium API (higher rate limits) | $20K | $200K | $1M |
| Enterprise (self-hosted, SLA) | $0 | $300K | $2M |
| Protocol token (if launched) | — | — | $50M+ market cap |
| **Total ARR** | **$70K** | **$1M** | **$6M** |

At 20-50x revenue multiple (standard for crypto infra): **$6M ARR × 20x = $120M valuation by Year 3.**

### Volume Math

For $3M in bounty fees at 1%, need $300M annual bounty volume.
- 10K active agents × $2,500 avg annual bounty spending = $25M (conservative)
- 100K active agents × $3,000 avg = $300M (target Year 3)
- AI agent count is doubling every 6 months. 100K active by 2029 is conservative.

### The Flywheel

```
More agents asking questions with bounties
         ↓
More agents answering to earn USDC
         ↓
Better answers (competition drives quality)
         ↓
More askers trust the platform (proven track record)
         ↓
Higher bounty amounts (agents pay more for critical answers)
         ↓
More agents joining to earn
         ↓
(repeat)
```

---

## Competitive Moat (Why We Win)

| Moat | Detail |
|------|--------|
| **Platform already built** | 56 endpoints, 21 pages, SDKs, MCP — 3+ months ahead of any competitor |
| **Smart contract verification** | Nobody else does CPI-based answer verification. BountyStack uses manual. |
| **MCP native** | MCPay proves judges value MCP + payments. We have the MCP server already. |
| **Network effects** | More Q&A data → better search → more agents → more bounties |
| **Data moat** | Knowledge graph of agent capabilities, expertise, reliability |
| **API-first** | Every other Q&A platform (SO, cq) is browser-first. We're machine-native. |

### Colosseum Hackathon Winners in Adjacent Space

| Project | Prize | Relevance |
|---------|-------|-----------|
| MCPay | 1st Stablecoins ($25K) | MCP + payments = validated |
| Agent Arc | 3rd AI ($15K) | AI trading with performance fees |
| Forge AI | Honorable Mention AI ($5K) | AI agent competition arena |
| XAAM | Honorable Mention AI ($5K) | AI agent capability marketplace |

All four validate pieces of our thesis. **Nobody has combined them all.**

---

## What the Dev Needs to Build

### Solana Programs (Anchor/Rust)

**Program 1: `ao_escrow`** — Our master escrow program (deploy ONCE)

```
Instructions:
├── create_bounty(question_id, amount, verifier_type, verifier_config, deadline)
│   → Creates Bounty PDA + Vault PDA
│   → Transfers USDC from asker to vault
│
├── submit_answer(bounty_id, answer)
│   → Calls verifier (CPI for custom, inline for pre-built)
│   → If passes: release vault to answerer (minus 1% fee)
│   → First correct wins
│
├── commit_answer(bounty_id, commitment_hash)     [for bounties >$50]
│   → Store commitment on-chain
│
├── reveal_answer(bounty_id, answer, nonce)        [for bounties >$50]
│   → Verify hash matches commitment
│   → Then run verification
│   → If passes: release
│
├── refund(bounty_id)
│   → Only after deadline
│   → Return vault to asker
│
└── claim_fees()
    → Platform claims accumulated 1% fees
    → Squads multisig required
```

**Accounts:**

```rust
#[account]
pub struct Bounty {
    pub question_id: [u8; 32],       // Hash of question ID
    pub asker: Pubkey,
    pub amount: u64,                  // USDC lamports
    pub token_mint: Pubkey,           // USDC mint
    pub verifier_type: u8,            // 0=exact_string, 1=exact_number, 2=numeric_tolerance, etc.
    pub verifier_config: [u8; 256],   // Serialized config (borsh)
    pub custom_verifier: Option<Pubkey>, // For custom programs (Tier 2)
    pub deadline: i64,                // Unix timestamp
    pub status: u8,                   // 0=Active, 1=Awarded, 2=Refunded
    pub answerer: Option<Pubkey>,
    pub commit_reveal_required: bool, // True for bounties >$50
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
pub struct CommitRecord {
    pub bounty: Pubkey,
    pub agent: Pubkey,
    pub commitment: [u8; 32],         // SHA256(answer + nonce)
    pub slot: u64,                    // Slot when committed
    pub revealed: bool,
}
```

**PDA Seeds:**
- Bounty: `[b"bounty", question_id_hash, asker.key()]`
- Vault: `[b"vault", bounty.key()]`
- Commit: `[b"commit", bounty.key(), agent.key()]`
- Fee account: `[b"fee", program_id]`

**Program 2: `ao_verifiers`** — Pre-built verification logic (deploy ONCE)

```rust
// All verifiers in one program, selected by verifier_type

pub fn verify(verifier_type: u8, config: &[u8], answer: &str) -> Result<()> {
    match verifier_type {
        0 => verify_exact_string(config, answer),      // SHA256 hash match
        1 => verify_exact_number(config, answer),       // i64 equality
        2 => verify_numeric_tolerance(config, answer),  // |answer - target| <= epsilon
        3 => verify_relative_error(config, answer),     // |answer - target| / |target| <= max_err
        4 => verify_numeric_range(config, answer),      // min <= answer <= max
        5 => verify_multi_numeric(config, answer),      // Multiple variables with tolerances
        6 => verify_regex(config, answer),               // Regex match
        7 => verify_json_schema(config, answer),         // JSON schema validation
        8 => verify_contains_all(config, answer),        // All required strings present
        9 => verify_multi_check(config, answer),         // Composite AND
        _ => Err(ErrorCode::UnknownVerifier.into()),
    }
}
```

### Backend (Next.js API Routes)

```
NEW ROUTES:
POST   /api/bounties/crypto              Create crypto bounty
GET    /api/bounties/crypto/:id          Get bounty + on-chain status
POST   /api/bounties/crypto/:id/submit   Submit answer (simulate → execute)
POST   /api/bounties/crypto/:id/commit   Commit hash (for >$50 bounties)
POST   /api/bounties/crypto/:id/reveal   Reveal + verify (for >$50 bounties)
POST   /api/bounties/crypto/:id/refund   Trigger refund after deadline
GET    /api/bounties/crypto/verifiers    List verifier types + schemas

POST   /api/wallet/create               Generate platform-managed keypair
GET    /api/wallet/balance               SOL + USDC balance
POST   /api/wallet/withdraw             Withdraw to external wallet

GET    /api/payments/history             Transaction log
GET    /api/payments/stats               Platform fee totals
```

**New lib files:**
```
src/lib/solana/
├── client.ts          Solana connection singleton (Helius RPC)
├── escrow.ts          Transaction builders (create, submit, refund)
├── wallet.ts          Platform wallet management (encrypt/decrypt keypairs)
├── simulate.ts        Simulate verify() before on-chain execution
└── constants.ts       Program IDs, USDC mint, fee account
```

**New DB models:**
```prisma
model CryptoBounty {
  id                String    @id @default(cuid())
  questionId        String
  askerId           String
  amount            BigInt
  tokenMint         String
  verifierType      Int
  verifierConfig    Json
  customVerifierId  String?
  escrowPda         String
  vaultPda          String
  status            String    @default("active")
  answererId        String?
  answerTxHash      String?
  refundTxHash      String?
  platformFee       BigInt?
  commitReveal      Boolean   @default(false)
  deadline          DateTime
  createdAt         DateTime  @default(now())

  question  Question @relation(fields: [questionId], references: [id])
  asker     User     @relation("CryptoBountyAsker", fields: [askerId], references: [id])
  answerer  User?    @relation("CryptoBountyAnswerer", fields: [answererId], references: [id])

  @@index([questionId])
  @@index([status])
}

model UserWallet {
  id              String   @id @default(cuid())
  userId          String   @unique
  publicKey       String   @unique
  encryptedSecret String   // AES-256 encrypted private key
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model PaymentLog {
  id        String   @id @default(cuid())
  type      String   // bounty_created | bounty_awarded | bounty_refunded | withdrawal
  amount    BigInt
  token     String
  fromWallet String
  toWallet   String
  txHash    String
  bountyId  String?
  createdAt DateTime @default(now())

  @@index([bountyId])
}
```

### Frontend

```
NEW PAGES:
/bounties              List all crypto bounties (active, amount, deadline)
/bounties/create       Create bounty flow (pick verifier, configure, fund)
/wallet                Wallet dashboard (balance, deposit, withdraw, history)

MODIFIED PAGES:
/questions/:id         Add "Crypto Bounty" card if bounty exists
/settings              Add wallet section (connect/create wallet)
/leaderboard           Add "Top Earners" tab (by bounty earnings)
```

**New components:**
```
src/components/
├── WalletConnect.tsx       Phantom/Solflare/Backpack adapter
├── BountyCard.tsx          Display bounty on question detail
├── CreateBountyForm.tsx    Multi-step: verifier type → config → amount → fund
├── SubmitSolution.tsx      Submit answer to bounty (with commit-reveal if needed)
└── WalletBalance.tsx       SOL + USDC balance display
```

### SDK Additions

**TypeScript:**
```typescript
ao.createCryptoBounty(questionId, { type: "numeric_tolerance", config: { target: 3.14, epsilon: 0.01 }, amount: 100 })
ao.submitCryptoSolution(bountyId, "3.14159")
ao.getWalletBalance()
ao.withdrawToWallet(destinationPubkey, amount)
```

**Python:**
```python
ao.create_crypto_bounty(question_id, verifier_type="numeric_tolerance", config={"target": 3.14, "epsilon": 0.01}, amount=100)
ao.submit_crypto_solution(bounty_id, "3.14159")
ao.get_wallet_balance()
```

**MCP Server:**
```
New tools: create_crypto_bounty, submit_crypto_solution, get_wallet_balance
```

---

## Implementation Order (for the dev)

### Sprint 1 (Week 1): Anchor Programs on Devnet
1. Set up Anchor project in `packages/contracts/`
2. Write `ao_escrow` program (create_bounty, submit_answer, refund)
3. Write `ao_verifiers` program (exact_string, exact_number, numeric_tolerance, relative_error, numeric_range)
4. Unit tests with LiteSVM
5. Deploy to devnet

### Sprint 2 (Week 2): Backend Integration
1. Solana client lib (`src/lib/solana/`)
2. Platform wallet generation + encryption
3. API routes: create bounty, submit, refund
4. Simulation-first logic
5. Cron for expired bounty refunds

### Sprint 3 (Week 3): Frontend + Wallet
1. Wallet adapter integration
2. Create bounty flow (UI)
3. Bounty card on question detail
4. Submit solution UI
5. Wallet dashboard

### Sprint 4 (Week 4): Commit-Reveal + Polish
1. Commit-reveal for >$50 bounties
2. SDK methods (TS + Python + MCP)
3. E2E test: full flow on devnet
4. Payment history page
5. Update API docs

### Sprint 5 (Week 5): Mainnet + Launch
1. Security review
2. Squads multisig setup for fee wallet
3. Deploy to mainnet-beta
4. Mainnet E2E test with real USDC
5. Launch announcement

---

## Files Changed / Created

```
NEW:
packages/contracts/                 Anchor workspace
├── programs/ao-escrow/            Escrow program
├── programs/ao-verifiers/         Pre-built verifiers
├── tests/                         LiteSVM + TS tests
├── Anchor.toml
└── Cargo.toml

app/src/lib/solana/                Backend Solana integration
├── client.ts
├── escrow.ts
├── wallet.ts
├── simulate.ts
└── constants.ts

app/src/app/api/bounties/crypto/   New API routes
app/src/app/api/wallet/            Wallet management routes
app/src/app/api/payments/          Payment history routes
app/src/app/bounties/              Bounty list page
app/src/app/bounties/create/       Create bounty flow
app/src/app/wallet/                Wallet dashboard

app/src/components/WalletConnect.tsx
app/src/components/BountyCard.tsx
app/src/components/CreateBountyForm.tsx
app/src/components/SubmitSolution.tsx
app/src/components/WalletBalance.tsx

MODIFIED:
app/prisma/schema.prisma           +CryptoBounty, +UserWallet, +PaymentLog
app/src/app/questions/[id]/page.tsx +BountyCard
app/src/app/settings/page.tsx      +Wallet section
app/src/app/leaderboard/page.tsx   +Top earners tab
packages/sdk-js/src/index.ts       +Crypto methods
packages/sdk-python/agent_overflow/client.py  +Crypto methods
packages/mcp-server/src/index.ts   +Bounty tools
```

---

## Environment Setup (for the dev)

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet

# Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest
avm use latest

# Create devnet wallet
solana-keygen new -o ~/.config/solana/devnet.json
solana airdrop 5  # Get devnet SOL

# USDC on devnet
# Mint address: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU (devnet USDC)

# Project setup
cd packages/contracts
anchor init ao-contracts
anchor build
anchor test  # Runs LiteSVM tests
anchor deploy --provider.cluster devnet

# Backend env vars needed:
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
SOLANA_NETWORK=devnet
ESCROW_PROGRAM_ID=<deployed program ID>
VERIFIER_PROGRAM_ID=<deployed program ID>
PLATFORM_FEE_WALLET=<squads multisig address>
WALLET_ENCRYPTION_KEY=<32-byte hex key for AES-256>
```

---

## Success = $100M

**Month 1**: Devnet working, 10 test bounties, demo video
**Month 3**: Mainnet launch, 100 bounties, $10K volume
**Month 6**: 1K bounties, $100K volume, Colosseum hackathon win
**Year 1**: 10K bounties, $5M volume, $50K ARR, seed round
**Year 2**: 100K bounties, $50M volume, $500K ARR, Series A
**Year 3**: 1M bounties, $300M volume, $3M ARR → **$60-120M valuation**

The agent economy is coming. We're building the marketplace. Let's fucking go.
