# Wallet UX Fixes — Task Spec

Bugs found via Playwright testing on May 10, 2026.
All three are frontend fixes. No backend or Anchor changes needed.

---

## Bug 1 — LI.FI widget hidden behind Solana wallet gate (CRITICAL for LI.FI submission)

**File:** `app/src/app/wallet/page.tsx`

**Problem:**
The "Bridge from Another Chain" section (LI.FI widget) is inside the `if (!connected)` early return,
so it never renders unless Phantom/Solflare is already connected. This defeats the entire purpose —
the widget exists for users who DON'T have Solana USDC yet.

**Current code (wrong):**
```tsx
if (!connected) {
  return (
    <div>Connect Your Wallet...</div>  // LI.FI widget never shown
  );
}

return (
  <div>
    {/* Balances */}
    {/* Deposit */}
    {/* LI.FI widget */}   ← only reachable if already connected
    {/* Withdraw */}
  </div>
);
```

**Fix:**
Split the page into two sections:
1. **Always visible (logged in only):** Deposit address + LI.FI bridge widget
2. **Requires Solana wallet:** SOL balance, USDC balance, withdraw

```tsx
if (!apiKey) {
  return <LogInPrompt />;
}

return (
  <div className="max-w-3xl mx-auto space-y-8">
    <h1>Wallet Dashboard</h1>

    {/* ── Always visible once logged in ── */}

    {/* Platform deposit address */}
    <div className="card p-5">
      <h2>Deposit USDC</h2>
      <p>Send USDC to this Solana address...</p>
      {depositAddress && <DepositAddressDisplay address={depositAddress} />}
    </div>

    {/* LI.FI bridge — no Solana wallet required */}
    <div className="card p-5">
      <h2>Bridge from Another Chain</h2>
      <p>Have USDC on Ethereum, Base, Arbitrum? Bridge it here.</p>
      {depositAddress && <LiFiDepositWidget walletAddress={depositAddress} />}
    </div>

    {/* ── Requires connected Solana wallet ── */}

    {!connected ? (
      <div className="card p-5 text-center">
        <p>Connect a Solana wallet to view balances and withdraw.</p>
        <button onClick={() => setVisible(true)}>Connect Wallet</button>
      </div>
    ) : (
      <>
        {/* SOL + USDC balances */}
        {/* Withdraw form */}
        {/* Transaction history */}
      </>
    )}
  </div>
);
```

The key change: `depositAddress` comes from `GET /api/wallet/deposit` which only needs the
API key (platform wallet), not a connected Solana wallet. The LI.FI widget destination is
the platform wallet address, so no Solana wallet adapter needed.

---

## Bug 2 — No platform wallet auto-creation on registration

**Files:**
- `app/src/app/api/auth/register/route.ts`

**Problem:**
New users who register and immediately visit `/wallet` get silent 404 errors because
`GET /api/wallet/balance` and `GET /api/wallet/deposit` both return 404 when no platform
wallet exists. There's no visible error or CTA — it just silently fails.

**Fix — auto-create on registration:**
In the register route, after creating the user, immediately create their platform wallet:

```typescript
// After: const user = await prisma.user.create(...)

// Auto-create platform wallet
const keypair = Keypair.generate();
const encrypted = encryptKeypair(keypair.secretKey);
await prisma.userWallet.create({
  data: {
    userId: user.id,
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecret: encrypted,
  },
});

// Return walletAddress alongside apiKey
return Response.json({
  ...user,
  walletAddress: keypair.publicKey.toBase58(),
});
```

Import needed: `import { Keypair } from "@solana/web3.js"` and `encryptKeypair` from
`@/lib/solana/wallet`.

**Alternative (simpler, if auto-create is too risky):**
In the wallet page, when `/api/wallet/deposit` or `/api/wallet/balance` returns 404,
show a visible "Create your platform wallet" button that calls `POST /api/wallet/create`.
Currently these 404s are silently swallowed.

---

## Bug 3 — Auth state lost on page reload (React hydration error #418)

**File:** `app/src/components/AuthProvider.tsx`

**Problem:**
React error #418 (hydration mismatch). The `useState` lazy initializers read from
`localStorage` during SSR where `localStorage` is undefined. The `typeof window` guard
IS present in the `ls()` function, so SSR returns null. The server renders "Log in" state.

On the client, React re-runs the initializers and gets the real JWT from localStorage,
but the hydration mismatch between server HTML and client state causes React to either
throw error #418 or silently commit to the server-rendered (null) state.

Result: refreshing the page while logged in shows "Log in" until you interact with the page.

**Fix:**
Replace lazy initializers with `null` defaults + `useEffect` to populate from localStorage:

```tsx
// BEFORE (broken on SSR):
const [apiKey, setApiKey] = useState<string | null>(() => ls("ao_apiKey"));
const [userId, setUserId] = useState<string | null>(() => ls("ao_userId"));
const [userName, setUserName] = useState<string | null>(() => ls("ao_userName"));
const [rawKey, setRawKey] = useState<string | null>(() => ls("ao_rawKey"));

// AFTER (SSR safe):
const [apiKey,   setApiKey]   = useState<string | null>(null);
const [userId,   setUserId]   = useState<string | null>(null);
const [userName, setUserName] = useState<string | null>(null);
const [rawKey,   setRawKey]   = useState<string | null>(null);

useEffect(() => {
  setApiKey(ls("ao_apiKey"));
  setUserId(ls("ao_userId"));
  setUserName(ls("ao_userName"));
  setRawKey(ls("ao_rawKey"));
}, []);
```

This causes a brief flash of "not logged in" on first load (which was already happening
invisibly), but eliminates the hydration mismatch and ensures state is always correct
after the first render.

**Note:** This will cause a brief flash where logged-in users see "Log in" for ~1 frame
on every page load. To prevent this, add a `[data-mounted]` attribute to the body in
the useEffect and CSS to hide auth-dependent UI until mounted. But this is optional —
the current behavior (permanent logged-out state after reload) is far worse.

---

## Priority

| Bug | Impact | Effort | Fix first? |
|-----|--------|--------|-----------|
| 1 — LI.FI behind wallet gate | 🔴 Blocks LI.FI demo/submission | 30 min | YES |
| 2 — No auto wallet creation | 🟡 New users see broken wallet page | 1 hr | YES |
| 3 — Auth hydration mismatch | 🟡 Page reload loses auth state | 1 hr | YES |

All three should be shipped together. Bug 1 is blocking the LI.FI track submission.
