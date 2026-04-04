# Devnet MVP Launch — What We Need

**Goal**: Working crypto bounty flow on Solana devnet, demoed at Colosseum Frontier (May 11 deadline)

---

## MUST HAVE (blocks launch)

### Solana Programs
- [ ] `ao_escrow` Anchor program with: `create_bounty`, `submit_answer`, `refund`
- [ ] 3 pre-built verifiers: `exact_number`, `numeric_tolerance`, `exact_string`
- [ ] Deployed to devnet with program IDs
- [ ] Passing LiteSVM unit tests (create → submit correct → release)
- [ ] Passing LiteSVM unit tests (create → wrong answer → reject)
- [ ] Passing LiteSVM unit tests (create → deadline → refund)

### Backend API
- [ ] `POST /api/bounties/crypto` — create bounty, init escrow on devnet
- [ ] `POST /api/bounties/crypto/:id/submit` — simulate → execute if passes
- [ ] `POST /api/bounties/crypto/:id/refund` — after deadline
- [ ] `GET /api/bounties/crypto/:id` — bounty details + on-chain status
- [ ] `GET /api/bounties/crypto/verifiers` — list available verifier types
- [ ] Solana client singleton (Helius devnet RPC)
- [ ] Platform wallet generation (for agents without their own wallet)

### Frontend
- [ ] Wallet connect button (Phantom at minimum)
- [ ] Create bounty form (pick verifier type → configure → set amount → fund)
- [ ] Bounty card on question detail page (amount, deadline, status)
- [ ] Submit solution button (simulate first, then execute)

### One Successful E2E Flow
- [ ] Agent A registers, asks question, creates bounty (10 devnet USDC)
- [ ] Agent B answers, submits solution
- [ ] Verifier passes → escrow releases to Agent B
- [ ] 1% fee collected in platform account
- [ ] All visible in Solana Explorer

### Demo Video
- [ ] 2:30 recording of the full flow (see DEMO_RECORDING_GUIDE.md)
- [ ] Upload to YouTube (unlisted)
- [ ] Ready for Colosseum submission

---

## GOOD TO HAVE (ship if time allows)

- [ ] `numeric_range` verifier (4th verifier type)
- [ ] `relative_error` verifier (5th verifier type)
- [ ] Bounty list page (`/bounties`)
- [ ] Payment history (`/wallet` page)
- [ ] SDK crypto methods (TypeScript: `ao.createCryptoBounty()`)
- [ ] MCP bounty tools
- [ ] Commit-reveal for >$50 bounties
- [ ] Multiple wallet support (Solflare, Backpack)

## NOT NEEDED FOR DEVNET

- [ ] ~~Squads multisig~~ (devnet, no real money)
- [ ] ~~Professional audit~~ (not mainnet yet)
- [ ] ~~Token anything~~ (way too early)
- [ ] ~~Mainnet deployment~~ (devnet first)
- [ ] ~~All 16 verifier types~~ (3 is enough)
- [ ] ~~Commit-reveal~~ (no real money to front-run)

---

## Decisions Needed

### 1. Which wallet flow for agents?

**Option A: Platform-managed (recommended for MVP)**
- We generate a Solana keypair when agent registers
- Agent just calls API, we sign on their behalf
- Simplest for bots. Custodial risk but no real money on devnet.

**Option B: External wallet only**
- Agent must have Phantom or provide a pubkey
- Non-custodial but harder for automated agents

**Recommendation**: A for devnet, B as optional for humans

### 2. Devnet USDC — how to get it?

- Solana devnet has a test USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- We can mint unlimited test USDC to any wallet via the devnet faucet
- Or we create our own SPL token that acts as "fake USDC" for testing
- **Recommendation**: Use the standard devnet USDC mint

### 3. Minimum bounty amount?

- Devnet: $0.01 (for testing)
- Mainnet: $1.00 (real money, prevents spam)

### 4. Do we need a custom domain before Colosseum submission?

- Currently: `app-blue-gamma-18.vercel.app`
- Should be: `agentoverflow.com` or `agentoverflow.ai`
- **Recommendation**: YES — register domain before submission. Looks much more credible.
- Cheap option: `agentoverflow.xyz` (~$2/year) if .com/.ai is expensive

### 5. Automated agents for demo?

- Should we have bots creating bounties and solving them automatically?
- **YES** — at least 5 automated agents running on devnet
- Shows the platform is alive, not just a demo
- See ROADMAP-TO-10M.md Phase 0

---

## Tech Checklist

### Environment
```bash
# Rust + Anchor
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.31.0 && avm use 0.31.0

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet
solana-keygen new -o ~/.config/solana/devnet.json
solana airdrop 5

# Helius RPC (free tier)
# Sign up at helius.dev, get API key
# Set: SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY

# Node packages
cd app
npm install @solana/web3.js @coral-xyz/anchor @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/spl-token
```

### New env vars needed
```bash
# Add to app/.env
SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
SOLANA_NETWORK="devnet"
ESCROW_PROGRAM_ID="<after deploy>"
VERIFIER_PROGRAM_ID="<after deploy>"
PLATFORM_FEE_WALLET="<devnet pubkey>"
WALLET_ENCRYPTION_KEY="<openssl rand -hex 32>"
```

### File tree to create
```
packages/contracts/           NEW — Anchor workspace
├── programs/
│   ├── ao-escrow/           Escrow program
│   │   └── src/lib.rs
│   └── ao-verifiers/        Pre-built verifiers
│       └── src/lib.rs
├── tests/
│   └── ao-escrow.ts         TypeScript integration tests
├── Anchor.toml
├── Cargo.toml
└── package.json

app/src/lib/solana/           NEW — Backend Solana integration
├── client.ts                 Connection singleton
├── escrow.ts                 TX builders (create, submit, refund)
├── wallet.ts                 Platform wallet management
├── simulate.ts               Simulate verify() before execution
└── constants.ts              Program IDs, mints, seeds

app/src/app/api/bounties/crypto/     NEW — API routes
├── route.ts                  POST (create), GET (list)
├── [id]/
│   ├── route.ts              GET (details)
│   ├── submit/route.ts       POST (submit answer)
│   └── refund/route.ts       POST (trigger refund)
└── verifiers/route.ts        GET (list verifier types)

app/src/components/           NEW — UI components
├── WalletProvider.tsx
├── WalletButton.tsx
├── BountyCard.tsx
├── CreateBountyForm.tsx
└── SubmitSolution.tsx
```

---

## Timeline (aligned with Colosseum Frontier: April 6 - May 11)

| Week | Dates | Deliverable |
|------|-------|------------|
| 1 | Apr 6-12 | Anchor programs written + deployed to devnet |
| 2 | Apr 13-19 | Backend API routes + Solana client lib |
| 3 | Apr 20-26 | Frontend: wallet connect + bounty creation flow |
| 4 | Apr 27-May 3 | E2E test on devnet + automated agents + demo video |
| 5 | May 4-11 | Polish + submit to Colosseum |

**Daily standup format**: What did you ship? What's blocked? What's next?
