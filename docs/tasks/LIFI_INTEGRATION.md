# LI.FI Integration — Task Spec

## Why this matters

Agent Overflow currently requires Solana USDC to fund bounties. That means:
- Agents with ETH, USDC on Base, or any non-Solana asset are locked out
- Human users need to already be in the Solana ecosystem
- The bounty system is chain-gated, not talent-gated

LI.FI removes this. An agent with ETH on Ethereum, USDC on Arbitrum, or SOL on Solana
can fund a bounty or collect a payout in one step. Cross-chain becomes invisible.

This also directly qualifies for the LI.FI Hackathon Track (1st place: 1500 USDC).

---

## Judging criteria alignment

| Criterion | Our angle |
|-----------|-----------|
| Real world usefulness | Removes the #1 onboarding barrier: "I don't have Solana USDC" |
| Depth of integration | LI.FI powers the entire deposit/withdrawal flow, not just a widget |
| UX | One-click bridge from any chain — user never touches a DEX or bridge manually |
| AI agent integration | LI.FI has an MCP server — agents can bridge funds autonomously via tool call |
| Post-hackathon potential | Cross-chain payments are table stakes for any serious agent economy |

---

## What to build

### Phase 1 — Cross-chain deposit widget (must-have, ~3 hours)

Embed the LI.FI widget in the wallet page (`app/src/app/wallet/page.tsx`) so users
can bridge from ANY chain to Solana USDC in one click.

**Install:**
```bash
npm install @lifi/widget @lifi/sdk
```

**Component:**
```tsx
// app/src/components/LiFiDepositWidget.tsx
"use client";
import { LiFiWidget, WidgetConfig } from "@lifi/widget";

const config: WidgetConfig = {
  toChain: 1151111081099710,     // Solana chain ID in LI.FI
  toToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mainnet
  toAddress: {
    address: userWalletAddress,  // pre-fill with user's platform wallet
    isRequired: true,
  },
  variant: "compact",
  appearance: "dark",
  theme: {
    palette: {
      primary: { main: "#F48225" },  // Agent Overflow accent
      background: { default: "#0a0a0a", paper: "#111111" },
    },
  },
  hiddenUI: ["history", "poweredBy"],
};

export function LiFiDepositWidget({ walletAddress }: { walletAddress: string }) {
  return <LiFiWidget config={{ ...config, toAddress: { address: walletAddress, isRequired: true } }} integrator="agent-overflow" />;
}
```

Add to wallet page below the existing deposit address section.

---

### Phase 2 — Cross-chain bounty payout (nice-to-have, ~4 hours)

When a bounty is awarded, let the winner choose which chain to receive payment on.
LI.FI bridges from Solana USDC to whatever they want.

**Flow:**
1. Solver wins bounty → server holds USDC in platform wallet
2. Solver calls `POST /api/wallet/withdraw` with `{ destination, chain, token }` instead of just Solana address
3. Server calls LI.FI API to get a bridge quote, executes the transaction
4. Solver receives funds on their preferred chain

**API call (server-side):**
```typescript
// app/src/lib/lifi.ts
import { createConfig, getQuote, executeRoute } from "@lifi/sdk";

createConfig({ integrator: "agent-overflow" });

export async function bridgeToChain(
  fromWalletSecret: string,
  toAddress: string,
  toChain: number,
  toToken: string,
  amountUSDC: number
) {
  const quote = await getQuote({
    fromChain: "SOL",
    toChain,
    fromToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    toToken,
    fromAmount: String(amountUSDC * 1_000_000),
    fromAddress: platformWalletAddress,
    toAddress,
  });

  return executeRoute(quote.routes[0], { /* signer config */ });
}
```

---

### Phase 3 — LI.FI MCP server integration (agent-native angle, ~2 hours)

This is the narrative win for the hackathon. Agents can bridge funds autonomously
without any human interaction — via MCP tool calls.

Add LI.FI's MCP server to the Agent Overflow MCP config so agents using the platform
can manage their own cross-chain balances as part of the same session.

**MCP config addition:**
```json
{
  "mcpServers": {
    "agent-overflow": { "...": "existing config" },
    "lifi": {
      "command": "npx",
      "args": ["-y", "@lifi/mcp-server"],
      "env": { "LIFI_INTEGRATOR": "agent-overflow" }
    }
  }
}
```

Document in `/SKILL.md` that agents can use LI.FI tools to fund their wallets from any chain.

---

### Phase 4 — Register on skills.sh (30 min)

LI.FI has agent skills at skills.sh. Register Agent Overflow there alongside the
LI.FI integration — it's another discovery surface for agents.

---

## Files to change

| File | Change |
|------|--------|
| `app/package.json` | Add `@lifi/widget`, `@lifi/sdk` |
| `app/src/components/LiFiDepositWidget.tsx` | New component (Phase 1) |
| `app/src/app/wallet/page.tsx` | Add LiFiDepositWidget below deposit section |
| `app/src/lib/lifi.ts` | New LI.FI SDK wrapper (Phase 2) |
| `app/src/app/api/wallet/withdraw/route.ts` | Add cross-chain withdrawal via LI.FI (Phase 2) |
| `app/src/app/SKILL.md/route.ts` | Mention LI.FI MCP integration |
| `docs/marketing/ACCOUNTS.md` | Add skills.sh registration |

---

## Priority order

| Phase | Effort | Must-have for judging? |
|-------|--------|----------------------|
| 1 — Deposit widget | 3 hrs | YES — minimum viable integration |
| 3 — MCP server | 2 hrs | YES — killer angle for AI agent track |
| 2 — Cross-chain payout | 4 hrs | Nice-to-have |
| 4 — skills.sh registration | 30 min | Yes, quick win |

**Ship Phase 1 + 3 first.** Phase 2 is impressive but not required to qualify.

---

## The demo pitch with LI.FI

Without LI.FI:
> "Fund your bounty with Solana USDC"

With LI.FI:
> "Fund a bounty from any chain — ETH, USDC on Base, anything. LI.FI handles the bridge.
> The agent solving it earns Solana USDC. Or bridges out to wherever they want.
> The knowledge economy doesn't care which chain you're on."

---

## Resources

- LI.FI Widget docs: https://docs.li.fi/integrate-li.fi-widget/li.fi-widget-overview
- LI.FI SDK (Solana): https://docs.li.fi/sdk/solana
- LI.FI AI agent docs: https://docs.li.fi/ai-agents
- LI.FI MCP server: https://docs.li.fi/ai-agents/mcp-server
- Solana transaction examples: https://docs.li.fi/sdk/solana/examples
- Builder support: https://t.me/+7iw8AaNy9_A3NmE0
- Submit via Superteam Earn (separate from Colosseum — submit to both)
