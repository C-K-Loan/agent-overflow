# Task: Frontend Crypto Integration

**For**: Frontend dev (Sarthib7 or other)
**Depends on**: Anchor programs deployed to devnet (backend dev delivers program IDs)
**Estimated effort**: 1-2 weeks

---

## Context

The backend Anchor escrow programs and API routes will be built by the backend dev (see MASTERPLAN.md). Once those are deployed to devnet with program IDs, the frontend dev needs to integrate the crypto bounty flow into the existing Next.js app.

The existing platform is at `/home/ckl/Agent/agent-overflow/app/`. It's Next.js 15, TypeScript, Tailwind CSS, deployed on Vercel.

---

## What to Build

### 1. Wallet Connection

**Install:**
```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/web3.js
```

**New component: `src/components/WalletProvider.tsx`**
- Wrap the app with `WalletProvider` + `ConnectionProvider`
- Support: Phantom, Solflare, Backpack
- Network: devnet (configurable via env var)

**New component: `src/components/WalletButton.tsx`**
- Show "Connect Wallet" button in header (next to login)
- When connected: show truncated address + SOL balance
- Clicking shows dropdown: balance, copy address, disconnect

**Modify: `src/app/settings/page.tsx`**
- Add "Wallet" section
- Show connected wallet address
- Show USDC + SOL balance
- "Disconnect" button
- Link wallet to Agent Overflow account (POST /api/auth/connect-wallet)

### 2. Create Crypto Bounty Flow

**New page: `src/app/bounties/create/page.tsx`**

Multi-step form:
1. **Select Question** — search existing questions or link to one
2. **Pick Verifier Type** — dropdown with descriptions:
   - Exact String (SHA256 hash)
   - Exact Number
   - Numeric Tolerance (±epsilon)
   - Relative Error (±%)
   - Numeric Range (min-max)
   - Multi-Variable Tolerance
   - Regex Match
   - JSON Schema
3. **Configure Verifier** — dynamic form based on type:
   - `exact_number`: input field for target value
   - `numeric_tolerance`: target + epsilon fields
   - `relative_error`: target + max % fields
   - `numeric_range`: min + max fields
   - `multi_numeric_tolerance`: add/remove variable rows (key, value, epsilon)
   - etc.
4. **Set Amount** — USDC input (min $1) + deadline picker (default 7 days)
5. **Review & Fund** — summary + "Fund Bounty" button that triggers wallet transaction

**UX Notes:**
- Show estimated gas cost (~$0.001)
- Show 1% platform fee breakdown
- Disable "Fund" if wallet not connected or insufficient balance
- After funding: redirect to question page with bounty card visible

### 3. Bounty Display on Questions

**New component: `src/components/BountyCard.tsx`**

Show on question detail page (`questions/[id]/page.tsx`) when a crypto bounty exists:
- Amount (e.g., "100 USDC")
- Verifier type (e.g., "Numeric Tolerance ±0.01")
- Deadline countdown (e.g., "5d 12h remaining")
- Status badge (Active / Awarded / Expired)
- If awarded: winner name + tx hash link to Solana Explorer
- If active + logged in: "Submit Solution" button

### 4. Submit Solution Flow

**New component: `src/components/SubmitSolution.tsx`**

On question detail page, when bounty is active:
- Text input for solution value
- For multi-variable: dynamic key-value inputs
- "Simulate" button (free, checks if answer is correct without on-chain tx)
- If simulation passes: "Submit & Claim Bounty" button (triggers wallet tx)
- If simulation fails: show "Incorrect — try again" (no cost)
- For bounties >$50: two-step commit-reveal UI (commit → wait → reveal)

### 5. Bounties List Page

**New page: `src/app/bounties/page.tsx`**

List all crypto bounties:
- Filter: Active / Awarded / Expired
- Sort: Amount (highest first) / Deadline (soonest first) / Newest
- Each card: question title, amount, verifier type, deadline, status
- Click → goes to question detail

### 6. Wallet Dashboard

**New page: `src/app/wallet/page.tsx`**

- Balance: SOL + USDC
- Transaction history (from /api/payments/history)
- Each tx: type, amount, date, tx hash → Solana Explorer link
- "Deposit" instructions (show wallet address + QR code)
- "Withdraw" form (destination address + amount)

### 7. Navigation Updates

**Modify: `src/app/layout.tsx`**
- Add "Bounties" link in nav (between Questions and Tags)
- Show wallet balance chip in header when connected

---

## Design Guidelines

- Use the existing `.card` CSS class for all cards
- Use the existing `.tag` class for badges/pills
- Orange = bounty related (`var(--accent)`)
- Green = awarded/success (`var(--green)`)
- Follow the existing theme system (works across all 4 themes)
- Mobile responsive (bounty cards stack vertically on mobile)

## API Routes You'll Call

These will be built by the backend dev. Assume they exist:

```
POST   /api/bounties/crypto              → { id, escrowPda, vaultPda }
GET    /api/bounties/crypto/:id          → full bounty details
POST   /api/bounties/crypto/:id/submit   → { success, txHash }
POST   /api/bounties/crypto/:id/commit   → { commitId }
POST   /api/bounties/crypto/:id/reveal   → { success, txHash }
GET    /api/bounties/crypto/verifiers    → [{ type, name, description, configSchema }]
POST   /api/wallet/create               → { publicKey }
GET    /api/wallet/balance               → { sol, usdc }
POST   /api/wallet/withdraw             → { txHash }
GET    /api/payments/history             → [{ type, amount, txHash, date }]
```

## Testing

- Test on Solana devnet (fake USDC, free SOL via airdrop)
- Create a test bounty with `exact_number` verifier (target: 42)
- Submit correct answer → verify bounty awarded
- Submit wrong answer → verify simulation catches it
- Let bounty expire → verify refund
- Test all 4 themes work with bounty UI
- Test mobile layout
