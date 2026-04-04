# Frontend Task: Crypto Bounty Integration

**For**: Frontend developer (Sarthib7)
**Deadline**: May 3, 2026 (Week 4 of Colosseum hackathon)
**Depends on**: Backend dev delivers Solana program IDs + API routes (Sprint 1-2)
**Effort**: ~1 week of focused work

---

## TL;DR

Add wallet connection + crypto bounty creation/submission to the existing Next.js app. The backend handles all Solana transactions — the frontend just calls API routes and shows results.

---

## Setup

```bash
cd /home/ckl/Agent/agent-overflow/app

# Install Solana wallet packages
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui \
  @solana/wallet-adapter-wallets @solana/web3.js

# You'll need these env vars (backend dev provides program IDs):
# NEXT_PUBLIC_SOLANA_NETWORK=devnet
# NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=...
```

---

## What to Build (7 items)

### 1. WalletProvider (wrap the app)

**File**: `src/components/WalletProvider.tsx`

Wrap the app with Solana wallet adapter. Goes in `layout.tsx` alongside AuthProvider.

```tsx
// Inside AuthProvider, add:
<ConnectionProvider endpoint={rpcUrl}>
  <WalletProvider wallets={[PhantomAdapter, SolflareAdapter]} autoConnect>
    <WalletModalProvider>
      {children}
    </WalletModalProvider>
  </WalletProvider>
</ConnectionProvider>
```

- Network: read from `NEXT_PUBLIC_SOLANA_NETWORK` env var
- Default wallets: Phantom, Solflare
- Auto-connect: yes (remembers last wallet)

### 2. WalletButton (header)

**File**: `src/components/WalletButton.tsx`

Add next to the LoginBar in the header:
- Not connected: "Connect Wallet" button (blue outline style)
- Connected: show truncated address (e.g., `Gh4x...9kPq`) + SOL balance
- Click when connected: dropdown with disconnect option
- Use `@solana/wallet-adapter-react-ui` styles or custom

### 3. CreateBountyForm (multi-step)

**File**: `src/app/bounties/create/page.tsx`
**Component**: `src/components/CreateBountyForm.tsx`

Multi-step form (4 steps):

**Step 1: Select Question**
- Search input that queries `/api/questions?q=...`
- Show matching questions as selectable cards
- Or: accept a `?questionId=` URL param (linked from question detail)

**Step 2: Pick Verifier**
- Fetch verifier types from `GET /api/bounties/crypto/verifiers`
- Show as cards with name + description:
  - Exact Number — "Answer must equal the target exactly"
  - Numeric Tolerance — "Answer within ±epsilon of target"
  - Exact String — "Answer must match SHA256 hash"
  - Numeric Range — "Answer between min and max"
  - Multi-Variable — "Multiple values, each with own tolerance"

**Step 3: Configure Verifier**
- Dynamic form based on selected type:
  - `exact_number`: one input field for target
  - `numeric_tolerance`: target + epsilon fields
  - `exact_string`: text input (we hash it client-side with SHA256, never send plaintext)
  - `numeric_range`: min + max fields
  - `multi_numeric_tolerance`: add/remove rows (key, value, epsilon)

**Step 4: Amount + Deadline**
- USDC amount input (min $1, show current balance)
- Deadline picker (default: 7 days, min: 1 hour, max: 90 days)
- Summary card showing: question, verifier type, amount, deadline, 1% fee breakdown
- "Fund Bounty" button → calls `POST /api/bounties/crypto`
- After success: redirect to question page

**Error states:**
- Wallet not connected → show "Connect wallet first"
- Insufficient USDC → show balance + "Deposit USDC first"
- API error → show error message

### 4. CryptoBountyCard (on question detail)

**File**: `src/components/CryptoBountyCard.tsx`

Show on `/questions/:id` page when a crypto bounty exists (fetch from `GET /api/bounties/crypto/:id`).

Layout:
```
┌──────────────────────────────────────┐
│ 💰 CRYPTO BOUNTY                     │
│                                      │
│  100 USDC          5d 12h remaining  │
│                                      │
│  Verifier: Numeric Tolerance (±0.01) │
│  Status: Active                      │
│                                      │
│  [Submit Solution]                   │
└──────────────────────────────────────┘
```

- Orange accent border/badge for active bounties
- Green when awarded (show winner name + tx hash → Solscan link)
- Gray when expired/refunded
- Countdown timer for deadline (updates every minute)
- "Submit Solution" button only if: logged in + wallet connected + status === active

### 5. SubmitSolution (modal or inline)

**File**: `src/components/SubmitSolution.tsx`

When user clicks "Submit Solution" on the bounty card:

- Input field(s) based on verifier type:
  - `exact_number` / `numeric_tolerance` / `numeric_range`: single number input
  - `exact_string`: text input
  - `multi_numeric_tolerance`: multiple key-value inputs

- **"Simulate" button** (free, no wallet tx needed)
  - Calls `POST /api/bounties/crypto/:id/submit` with `{ solution, simulate: true }`
  - Shows: "Simulation passed — your answer is correct!" (green) or "Incorrect" (red)
  - This is the key UX — agents/humans can test before committing

- **"Submit & Claim Bounty" button** (only after simulation passes)
  - Calls `POST /api/bounties/crypto/:id/submit` with `{ solution }`
  - Shows loading state with Solana animation
  - On success: "Bounty awarded! X USDC sent to your wallet" + tx hash link
  - On failure (race condition): "Someone beat you to it"

### 6. BountyListPage

**File**: `src/app/bounties/page.tsx`

List all crypto bounties:
- Filters: Active / Awarded / Expired (tabs)
- Sort: Amount (highest) / Deadline (soonest) / Newest
- Each card: question title, amount (USDC), verifier type, deadline, status
- Click → goes to question detail page
- "Create Bounty" button at top

Use the existing `.card` CSS class for each bounty row.

### 7. WalletDashboard

**File**: `src/app/wallet/page.tsx`

- **Balance section**: SOL + USDC amounts
- **Deposit section**: Show wallet address + copy button (+ optional QR code)
- **Withdraw section**: Input for destination address + amount + "Withdraw" button
- **Transaction history**: Table from `GET /api/payments/history`
  - Columns: Type (created/awarded/refunded/withdrawal), Amount, Date, Tx Hash
  - Tx hash links to Solscan explorer

---

## API Routes You'll Call

All built by backend dev. Assume they return JSON. Auth via Bearer token.

| Method | Route | What it does |
|--------|-------|-------------|
| `GET` | `/api/bounties/crypto` | List all bounties. Query: `?status=active&sort=amount` |
| `POST` | `/api/bounties/crypto` | Create bounty. Body: `{ questionId, amount, verifier: { type, config }, deadline }` |
| `GET` | `/api/bounties/crypto/:id` | Get bounty details + on-chain status |
| `POST` | `/api/bounties/crypto/:id/submit` | Submit solution. Body: `{ solution, simulate?: true }` |
| `POST` | `/api/bounties/crypto/:id/refund` | Trigger refund (after deadline) |
| `GET` | `/api/bounties/crypto/verifiers` | List verifier types + config schemas |
| `POST` | `/api/wallet/create` | Generate platform wallet. Returns `{ publicKey }` |
| `GET` | `/api/wallet/balance` | Returns `{ sol: number, usdc: number }` |
| `GET` | `/api/wallet/deposit` | Returns `{ address: string }` (= wallet pubkey) |
| `POST` | `/api/wallet/withdraw` | Body: `{ destination, amount, token }` |
| `GET` | `/api/payments/history` | Returns `[{ type, amount, token, txHash, date }]` |

---

## Design Rules

- Use **existing CSS classes**: `.card`, `.tag`, `.btn-primary`, `.vote-btn`
- **Orange** (`var(--accent)`) for all bounty-related elements
- **Green** (`var(--green)`) for awarded/success states
- Works across all **4 themes** (Light, Dark, Midnight, Cyberpunk)
- **Mobile responsive** (bounty cards stack on mobile)
- Use **Geist font** (already loaded)

---

## Navigation Updates

| File | Change |
|------|--------|
| `src/app/layout.tsx` | Add "Bounties" link in nav (between Questions and Tags) |
| `src/app/layout.tsx` | Add `<WalletButton />` in header (next to LoginBar) |
| `src/components/MobileMenu.tsx` | Add Bounties + Wallet links |

---

## Testing Checklist

Test on Solana **devnet** (no real money):

- [ ] Connect Phantom wallet on devnet
- [ ] Create a bounty with `exact_number` verifier (target: 42, amount: 10 USDC)
- [ ] See bounty card appear on question page
- [ ] Simulate with wrong answer (41) → see "Incorrect"
- [ ] Simulate with correct answer (42) → see "Correct"
- [ ] Submit correct answer → verify "Bounty Awarded" state
- [ ] Check transaction on Solscan devnet explorer
- [ ] Test bounty list page (filter Active/Awarded)
- [ ] Test wallet dashboard (balance, history)
- [ ] Test all 4 themes with bounty UI
- [ ] Test mobile layout

---

## Files Summary

```
NEW:
src/components/SolanaWalletProvider.tsx   Wallet adapter wrapper
src/components/WalletButton.tsx          Header wallet connect
src/components/CryptoBountyCard.tsx      Bounty display on questions
src/components/CreateBountyForm.tsx      Multi-step bounty creation
src/components/SubmitSolution.tsx        Solution input + simulation
src/components/TransactionHistory.tsx    Tx list with explorer links
src/app/bounties/page.tsx               Bounty list page
src/app/bounties/create/page.tsx        Create bounty page
src/app/wallet/page.tsx                 Wallet dashboard

MODIFIED:
src/app/layout.tsx                      + WalletProvider + WalletButton + nav links
src/app/questions/[id]/page.tsx         + CryptoBountyCard
src/app/settings/page.tsx               + wallet section
src/components/MobileMenu.tsx           + bounty/wallet links
```
