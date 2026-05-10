# LI.FI Integration — Task Spec

## Status: ✅ All 4 parts shipped

All parts below are already implemented. No further dev work needed for submission.

## Who builds what

**Frontend dev only. No backend, no Anchor changes.**

| Part | Effort | Status |
|------|--------|--------|
| LI.FI widget on wallet page | 1 hr | ✅ Done |
| SKILL.md + MCP config mention | 5 min | ✅ Done |
| Backend bridge-quote endpoint | 2 hrs | ✅ Done (bonus) |
| Insufficient balance nudge in bounty form | 1 hr | ✅ Done (bonus) |

That's it. Everything else is post-hackathon.

---

## Important constraints

- **Mainnet only** — LI.FI does not support Solana devnet as a bridge destination. This integration only works on mainnet. For the hackathon submission: show the UI and the quote API, don't attempt a live bridge demo.
- **Bridge delay** — Cross-chain bridging takes 1–30 minutes regardless of implementation. There is no way to make this instant. Don't attempt to demo a live bridge execution during judging — show the UI instead.
- **Demo strategy** — Screenshot the widget on `/wallet`, submit to Superteam Earn with the live URL. Judges want to see the integration exists, not watch a 10-minute bridge confirmation.

---

## Why / Prize

The #1 onboarding friction: new users don't have Solana USDC.
With LI.FI, a user with ETH on Ethereum or USDC on Base can fund a bounty in one step — no manual bridging.

Qualifies for **LI.FI Hackathon Track: 1st place 1500 USDC** (separate from Colosseum).
Submit via Superteam Earn (different form, 10 minutes extra).

---

## Core idea (simple version)

When a user creates a bounty and doesn't have enough Solana USDC:

1. Show "Bridge from another chain" button in the form
2. Opens LI.FI widget pre-configured: destination = their Solana platform wallet, token = USDC
3. User bridges from wherever they have funds
4. USDC arrives in their platform wallet
5. They proceed to fund the bounty

That's it. Minimum viable. Qualifies for the track.

---

## What to build

### Part 1 — Backend: bridge quote endpoint (backend dev, ~2 hrs)

**New file:** `app/src/app/api/wallet/bridge-quote/route.ts`

```typescript
// GET /api/wallet/bridge-quote?fromChain=eth&fromToken=USDC&amount=50
// Returns LI.FI route options for bridging to Solana USDC into the user's platform wallet

import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found" }, { status: 404 });

  const { searchParams } = request.nextUrl;
  const fromChain = searchParams.get("fromChain") ?? "eth";
  const fromToken = searchParams.get("fromToken") ?? "USDC";
  const amount    = searchParams.get("amount") ?? "10";

  // Call LI.FI REST API for a quote
  const res = await fetch(
    `https://li.quest/v1/quote?` +
    `fromChain=${fromChain}&toChain=sol` +
    `&fromToken=${fromToken}&toToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` +
    `&fromAmount=${parseFloat(amount) * 1_000_000}` +
    `&toAddress=${wallet.publicKey}` +
    `&integrator=agent-overflow`,
    { headers: { "Content-Type": "application/json" } }
  );

  if (!res.ok) return Response.json({ error: "Bridge quote unavailable" }, { status: 502 });
  const quote = await res.json();

  return Response.json({
    toAddress: wallet.publicKey,
    estimatedOutput: quote.estimate?.toAmount,
    estimatedTime:   quote.estimate?.executionDuration,
    tool:            quote.tool,
    route:           quote, // full quote for SDK execution
  });
}
```

---

### Part 2 — Frontend: LI.FI widget on wallet page (frontend dev, ~2 hrs)

**Install:**
```bash
cd app && npm install @lifi/widget
```

**New component:** `app/src/components/LiFiDepositWidget.tsx`

```tsx
"use client";
import { LiFiWidget, WidgetConfig } from "@lifi/widget";

const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_CHAIN_ID = 1151111081099710;

export function LiFiDepositWidget({ walletAddress }: { walletAddress: string }) {
  const config: WidgetConfig = {
    toChain:   SOLANA_CHAIN_ID,
    toToken:   SOLANA_USDC,
    toAddress: { address: walletAddress, isRequired: true },
    variant:   "compact",
    appearance: "dark",
    theme: {
      palette: {
        primary:    { main: "#F48225" },
        background: { default: "#0a0a0a", paper: "#111111" },
      },
    },
    hiddenUI: ["history", "poweredBy"],
    integrator: "agent-overflow",
  };

  return <LiFiWidget config={config} />;
}
```

**In `app/src/app/wallet/page.tsx`** — add below the existing Deposit section:

```tsx
import { LiFiDepositWidget } from "@/components/LiFiDepositWidget";

// After the existing deposit address card:
<div className="card p-5">
  <h2 className="font-semibold mb-3">Bridge from Another Chain</h2>
  <p className="text-xs text-[var(--muted)] mb-4">
    Don't have Solana USDC? Bridge from Ethereum, Base, Arbitrum, or 60+ other chains.
  </p>
  {depositAddress && <LiFiDepositWidget walletAddress={depositAddress} />}
</div>
```

---

### Part 3 — Frontend: "insufficient balance" nudge in bounty creation (frontend dev, ~1 hr)

**In `app/src/components/CreateBountyForm.tsx`** — in Step 4 (Fund Bounty), when `usdcBalance < total`:

Replace the current "Insufficient balance" text with:

```tsx
{usdcBalance !== null && usdcBalance < total && (
  <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "#F4822540", background: "#F4822508" }}>
    <p className="text-[var(--accent)] font-medium mb-2">
      You need {(total - usdcBalance).toFixed(2)} more USDC to fund this bounty.
    </p>
    <a
      href="/wallet"
      className="text-xs text-[var(--blue)] hover:underline"
    >
      Bridge from another chain on your wallet page →
    </a>
  </div>
)}
```

This is deliberately simple — just a link to the wallet page where the full widget lives.
No need to embed the widget inline in the form.

---

### Part 4 — SKILL.md update (frontend dev, 5 min)

In `app/src/app/SKILL.md/route.ts`, add to the wallet section:

```markdown
## Funding your wallet from another chain

Agent Overflow supports cross-chain deposits via LI.FI.
If your agent has USDC on Ethereum, Base, Arbitrum, or 60+ other chains,
it can bridge to Solana USDC automatically.

Use the LI.FI MCP server alongside Agent Overflow:
\`\`\`json
{
  "mcpServers": {
    "lifi": { "command": "npx", "args": ["-y", "@lifi/mcp-server"], "env": { "LIFI_INTEGRATOR": "agent-overflow" } }
  }
}
\`\`\`

Or call the bridge quote endpoint:
GET /api/wallet/bridge-quote?fromChain=eth&fromToken=USDC&amount=50
```

---

## Priority order

| Part | Effort | Ship? |
|------|--------|-------|
| Widget on wallet page | 1 hr | **YES — do this** |
| SKILL.md + MCP mention | 5 min | **YES — do this** |
| Backend bridge-quote endpoint | 2 hrs | Post-hackathon |
| Insufficient balance nudge in bounty form | 1 hr | Post-hackathon |
| Async auto-fund on bridge arrival | 2 days | Post-launch (mainnet feature) |

**For the hackathon: only the widget + SKILL.md. Everything else is scope creep.**

---

## Submission

Submit separately via **Superteam Earn** (not Colosseum form).
The LI.FI integration must be live and demonstrable.
Link to: `https://agentoverflow-app.vercel.app/wallet` as the demo URL.

Builder support Telegram: https://t.me/+7iw8AaNy9_A3NmE0

---

## Resources

- LI.FI Widget docs: https://docs.li.fi/integrate-li.fi-widget/li.fi-widget-overview
- LI.FI REST API (quote): https://docs.li.fi/li.fi-api/requesting-supported-chains
- LI.FI Solana SDK: https://docs.li.fi/sdk/solana
- LI.FI MCP server: https://docs.li.fi/ai-agents/mcp-server
