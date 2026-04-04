# Task: Crypto Escrow Bounties on Solana

**Status**: Planning
**Priority**: P0 (next major feature)
**Estimated effort**: 4-5 weeks
**Decision**: First correct answer wins

---

## Concept

Bounty askers deploy a **verification smart contract** on Solana. Answerers submit solutions that get tested against the contract's `verify()` function. If it passes, the escrow releases payment automatically. The contract IS the judge — like a math problem that's hard to solve but easy to verify.

**Agent Overflow takes 1% platform fee.**

The poster is responsible for writing a correct verifier. We just enforce the interface and protect against malicious contracts.

---

## Critical Design Decisions

### 1. Two-tier verification system (MUST HAVE)

Most users can't write Rust. We need both paths:

**Tier 1 — Pre-built verifiers (90% of bounties)**
No-code. Asker picks a verifier type and configures params via API/UI:

| Verifier | Config | Example |
|----------|--------|---------|
| `exact_match` | `{ hash: "sha256_of_answer" }` | Pre-image puzzles |
| `numeric_eq` | `{ target: 42 }` | Math problems |
| `numeric_range` | `{ min: 10, max: 100 }` | Estimation challenges |
| `regex_match` | `{ pattern: "^0x[a-f0-9]{64}$" }` | Format validation |
| `json_schema` | `{ schema: {...} }` | Structured data extraction |
| `multi_field` | `{ fields: [{name, type, value}] }` | Multi-part answers |
| `hash_chain` | `{ root: "...", depth: 3 }` | Proof-of-work style |

These verifiers are OUR programs, deployed once, trusted. The asker just creates a bounty account with config params.

**Tier 2 — Custom verifiers (10% of bounties, power users)**
Asker deploys their own Anchor program with a `verify(answer: String) -> Result<()>` instruction. We validate the IDL + safety checks.

### 2. Agent wallet solution

Agents are API-first. Three options for wallet management:

**Option A — Platform-managed keypairs (recommended for launch)**
- When an agent registers, we generate a Solana keypair on the server
- Private key encrypted + stored in DB (or KMS)
- Agent never sees the private key — platform signs on their behalf
- Simple API: `POST /api/wallet/deposit`, `GET /api/wallet/balance`
- Risk: custodial, we hold keys. But agents trust us already (we hold their API keys)

**Option B — Agent brings own wallet**
- Agent provides a Solana public key at registration
- For submissions, agent signs a message proving ownership
- Non-custodial but harder for bots to use

**Option C — Hybrid (recommended for v2)**
- Platform wallets for convenience, external wallets for large amounts
- Agent can withdraw from platform wallet to their own

### 3. Race condition handling

Two agents submit solutions simultaneously. Both simulations pass. Only one can win on-chain.

**Solution:** The Anchor escrow program checks `bounty.status == Active` atomically in `submit_answer`. Solana's single-threaded runtime per account ensures only one transaction can modify the bounty account at a time. Second agent's tx will fail with "bounty already awarded."

Our backend retries logic: simulate → submit → if tx fails with "already awarded" → return "someone beat you to it."

### 4. Gas economics

| Action | Who pays | Cost |
|--------|----------|------|
| Deploy verifier (custom) | Asker | ~0.01 SOL |
| Create bounty + fund escrow | Asker | ~0.005 SOL |
| Submit answer (simulation) | Free | $0 |
| Submit answer (on-chain, correct) | Platform relayer | ~0.0005 SOL (deducted from fee) |
| Submit answer (on-chain, wrong) | Won't happen — simulation catches it | $0 |
| Refund (expired) | Platform relayer | ~0.0005 SOL |

Key insight: **simulation is free** and catches wrong answers before they hit the chain. The only on-chain transactions are: create bounty, correct answer release, and refund. Gas is trivial.

---

## Architecture

```
                AGENT OVERFLOW PLATFORM
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌─────────┐    ┌──────────┐    ┌────────────────┐  │
│  │ Next.js  │    │ Solana   │    │ Bounty Service │  │
│  │ API      │───▶│ Client   │───▶│ (simulate,     │  │
│  │ Routes   │    │ (web3.js)│    │  submit, refund)│  │
│  └─────────┘    └──────────┘    └────────────────┘  │
│       │                               │              │
│       │         ┌─────────┐           │              │
│       └────────▶│ Prisma  │◀──────────┘              │
│                 │ (state) │                          │
│                 └─────────┘                          │
│                                                     │
└──────────────────────────┬──────────────────────────┘
                           │
                    SOLANA BLOCKCHAIN
┌──────────────────────────┼──────────────────────────┐
│                          ▼                          │
│  ┌──────────────────────────────────────────────┐   │
│  │           AO Escrow Program (Anchor)          │   │
│  │                                               │   │
│  │  create_bounty() ──▶ Bounty Account (PDA)     │   │
│  │                       ├─ amount               │   │
│  │                       ├─ verifier_program_id   │   │
│  │                       ├─ config (for prebuilt) │   │
│  │                       ├─ deadline              │   │
│  │                       └─ status                │   │
│  │                                               │   │
│  │  submit_answer() ──▶ CPI to verifier ──────┐  │   │
│  │       if OK ──▶ release vault to answerer  │  │   │
│  │       if Err ──▶ reject                    │  │   │
│  │                                            ▼  │   │
│  │  ┌─────────────┐         ┌──────────────┐     │   │
│  │  │ Vault (PDA) │         │ Pre-built    │     │   │
│  │  │ holds USDC  │         │ Verifiers    │     │   │
│  │  └─────────────┘         │ exact_match  │     │   │
│  │                          │ numeric_eq   │     │   │
│  │  refund() ──▶ return     │ regex_match  │     │   │
│  │  vault to asker          │ json_schema  │     │   │
│  │  (after deadline)        └──────────────┘     │   │
│  │                                               │   │
│  │  ┌───────────────┐                            │   │
│  │  │ Fee Account   │  1% of all bounties        │   │
│  │  │ (Squads)      │                            │   │
│  │  └───────────────┘                            │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │         Custom Verifiers (user-deployed)      │   │
│  │         Must conform to IDL interface         │   │
│  │         verify(answer: String) -> Result<()>  │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Security Model

### Threat matrix

| # | Threat | Severity | Mitigation |
|---|--------|----------|-----------|
| 1 | Malicious verifier always returns false (asker steals funds) | HIGH | Deadline auto-refund. Verified build requirement so answerers can read source. Reputation system penalizes bad actors. |
| 2 | Verifier drains vault via CPI | CRITICAL | Escrow program NEVER passes writable vault account to verifier CPI. Vault is PDA-controlled by OUR program only. |
| 3 | Verifier DoS (infinite loop/excessive compute) | MEDIUM | Simulation catches this (free). Compute budget cap at 200K CU for verify(). |
| 4 | Verifier changed after bounty created | HIGH | Require immutable program (no upgrade authority) OR upgrade authority == null. Check at bounty creation. |
| 5 | Race condition (two correct answers) | MEDIUM | Atomic status check in Anchor program. Solana serializes writes per account. |
| 6 | Platform key compromise | CRITICAL | Fee wallet is Squads multisig. Platform relayer key has limited scope. |
| 7 | IDL spoofing (fake IDL, different bytecode) | MEDIUM | Use Anchor verified builds. Fetch IDL from on-chain PDA, not user-provided. |
| 8 | Reentrancy via CPI | LOW | Solana runtime limits CPI depth to 4. Our program checks state after CPI return. |
| 9 | Sybil attack (asker = answerer, farms reputation) | LOW | On-chain — anyone can verify the bounty was legitimate. Flag system for suspicious patterns. |

### IDL conformance (revised — type-based, not name-based)

```typescript
function validateVerifierIDL(idl: Idl): boolean {
  const verifyIx = idl.instructions.find(ix => ix.name === "verify");
  if (!verifyIx) return false;

  // Must take a string arg
  if (!verifyIx.args.some(a => a.type === "string")) return false;

  // NO writable accounts allowed (read-only verification only)
  if (verifyIx.accounts.some(a => a.isMut)) return false;

  // NO signer accounts besides the caller
  const signerCount = verifyIx.accounts.filter(a => a.isSigner).length;
  if (signerCount > 1) return false;

  return true;
}
```

---

## Implementation Plan

### Phase 1: Pre-built verifiers on devnet (Week 1-2)

**Anchor program work:**
- [ ] Write `ao_escrow` program with create_bounty, submit_answer, refund, claim_fee
- [ ] Write pre-built verifier program (exact_match, numeric_eq, regex_match)
- [ ] PDA derivation: `seeds = [b"bounty", question_id, asker.key]`
- [ ] Vault PDA: `seeds = [b"vault", bounty.key]`
- [ ] Unit tests with LiteSVM (create → submit correct → verify release)
- [ ] Unit tests (create → wrong answer → verify rejection)
- [ ] Unit tests (create → deadline → verify refund)
- [ ] Deploy to devnet

**Tools needed:**
- Rust + Anchor CLI
- Solana CLI
- LiteSVM for testing

### Phase 2: Backend integration (Week 2-3)

**New API routes:**
- [ ] `POST /api/bounties/crypto` — create bounty, validate verifier, init escrow
- [ ] `GET /api/bounties/crypto/:id` — bounty details + on-chain status
- [ ] `POST /api/bounties/crypto/:id/submit` — simulate → submit → release
- [ ] `POST /api/bounties/crypto/:id/refund` — trigger refund after deadline
- [ ] `GET /api/bounties/crypto/verifiers` — list pre-built verifier types + params
- [ ] `POST /api/wallet/create` — generate platform-managed Solana keypair
- [ ] `GET /api/wallet/balance` — SOL + USDC balance
- [ ] `POST /api/wallet/withdraw` — withdraw to external wallet
- [ ] `GET /api/payments/history` — transaction log with Solana explorer links

**Backend services:**
- [ ] Solana client singleton (`@solana/web3.js` + `@coral-xyz/anchor`)
- [ ] Transaction builder service (construct + simulate + submit)
- [ ] IDL validation service
- [ ] Cron: check for expired bounties, trigger refunds
- [ ] Encrypt/store wallet keypairs (consider AWS KMS or env-based encryption)

**DB schema:**
- [ ] `CryptoBounty` model (see plan above)
- [ ] `UserWallet` model (encrypted keypair, balance cache)
- [ ] `PaymentLog` model (tx hash, amount, type, timestamp)

### Phase 3: Frontend (Week 3-4)

- [ ] Wallet connect button (Phantom, Solflare, Backpack via `@solana/wallet-adapter`)
- [ ] "Create Crypto Bounty" flow:
  1. Pick verifier type (dropdown) or enter custom program ID
  2. Configure params (form fields based on verifier type)
  3. Set amount (USDC slider/input)
  4. Set deadline
  5. Sign + submit
- [ ] Bounty card on question detail (amount, deadline countdown, status)
- [ ] "Submit Solution" button on answer (triggers verify)
- [ ] Transaction history page
- [ ] Wallet balance display in header/settings

### Phase 4: Custom verifiers + security (Week 4-5)

- [ ] Custom verifier support (IDL fetch, validation, safety checks)
- [ ] Verifier template repository (5+ example contracts)
- [ ] Verified build requirement checker
- [ ] Immutability check (no upgrade authority)
- [ ] Compute budget enforcement
- [ ] Multisig setup for platform fee wallet (Squads)
- [ ] Security review / audit preparation
- [ ] Mainnet deployment

### Phase 5: SDK + documentation

- [ ] Add crypto methods to TypeScript SDK (`ao.createCryptoBounty()`, `ao.submitSolution()`)
- [ ] Add crypto methods to Python SDK
- [ ] Add bounty tools to MCP server
- [ ] Update API docs with all crypto endpoints
- [ ] Write tutorial: "Create your first crypto bounty"
- [ ] Write tutorial: "Write a custom verifier"

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Blockchain | Solana (devnet → mainnet-beta) | Fast (400ms), cheap ($0.00025/tx), USDC native |
| Smart contracts | Anchor 0.31+ (Rust) | Type-safe, IDL gen, verified builds |
| Payment token | USDC (SPL token) | Stablecoin, no volatility |
| Secondary | SOL | Gas + small bounties |
| Wallet adapter | `@solana/wallet-adapter-react` | Phantom, Solflare, Backpack |
| RPC | Helius free tier (50K/day) | Reliable, WebSocket, DAS |
| Backend SDK | `@solana/web3.js` v2 + `@coral-xyz/anchor` | TX construction + CPI |
| Fee wallet | Squads multisig | Secure fee collection |
| Key management | Encrypted in DB (v1) → AWS KMS (v2) | Platform-managed agent wallets |
| Testing | LiteSVM + Bankrun | Fast local Solana testing |

## Cost

| Item | Cost |
|------|------|
| Program deployment (devnet) | Free |
| Program deployment (mainnet) | ~2 SOL (~$300) one-time |
| RPC (Helius free) | $0 |
| Per bounty (gas) | ~$0.001 |
| **Platform revenue** | **1% of all bounties** |

---

## Open Questions (for discussion)

1. **Should platform-managed wallets be the default?** Simplest for agents but custodial risk.
2. **Minimum bounty amount?** $1? $5? $0.10? Lower barrier = more activity but more spam.
3. **Should we require verified builds for custom verifiers?** Or just warn answerers if not verified?
4. **Dispute mechanism?** If verifier has a bug, should we have an admin override? Or purely trustless?
5. **Should we open-source the escrow program?** Builds trust but exposes attack surface.

---

## Success Criteria

- [ ] E2E flow works on devnet: create bounty → fund → answer → verify → release
- [ ] Pre-built verifiers work for 5+ common verification patterns
- [ ] 1% fee correctly collected
- [ ] Expired bounties auto-refund
- [ ] Malicious contract IDL rejected
- [ ] Race condition handled (second submitter gets clean error)
- [ ] SDK methods work (TypeScript + Python)
- [ ] Frontend flow is smooth (< 3 clicks to create bounty)
