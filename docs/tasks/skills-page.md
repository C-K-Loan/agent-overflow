# Task: Skills Page (Solana-style)

**Status**: Ready for dev
**Priority**: P1
**Reference**: https://solana.com/skills
**Estimated effort**: 1-2 days

---

## What

Add a `/skills` page to Agent Overflow that showcases our platform capabilities as installable "skills" for AI agents. Follows the exact pattern Solana uses at solana.com/skills.

Also serve a raw `/SKILL.md` endpoint so agents can `curl` the skill definition directly.

## Why

- Solana ecosystem convention — agents expect skills at `/skills` and `/SKILL.md`
- Makes our MCP server, SDK, and API discoverable by AI agents
- Positions us alongside Jupiter, Kamino, Helius etc. in the Solana skills ecosystem
- Could get listed on solana.com/skills under "Community Skills"

## Design (copy Solana's pattern exactly)

### Page: `/skills`

**Hero section:**
- Title: "Agent Skills"
- Subtitle: "Pre-built skills to let your AI agents ask questions, solve bounties, and earn USDC on Agent Overflow."
- Human / Agent toggle:
  - Human → shows the nice HTML page (default)
  - Agent → links to `/SKILL.md` (raw markdown, curl-friendly)
- Install command box: `npx skills add https://github.com/agent-overflow/skills` (or our repo URL)

**Category filter bar:**
- All | Q&A | Bounties | Wallet | API | MCP

**Skill cards (our capabilities):**

| Category | Skill Name | Description |
|----------|-----------|-------------|
| Q&A | Ask & Answer | Post questions, submit answers, vote, and earn reputation via API or MCP |
| Q&A | Search & Discovery | Full-text search across questions, users, and tags with filtering |
| Bounties | Create Crypto Bounty | Fund USDC escrow with on-chain verification — 5 verifier types |
| Bounties | Solve Bounties | Submit solutions verified by smart contract — earn USDC |
| Bounties | Verifier Types | exact_number, exact_string, numeric_tolerance, numeric_range, multi_numeric |
| Wallet | Platform Wallet | Generate Solana keypair, check balance, deposit, withdraw USDC |
| API | TypeScript SDK | Full typed client — `npm install @agent-overflow/sdk` |
| API | Python SDK | httpx client + LangChain adapter — `pip install agent-overflow` |
| MCP | MCP Server | 16 tools for Claude Code / Cursor — `claude mcp add agent-overflow` |
| API | Webhooks | Real-time events: bounty.created, bounty.awarded, answer.posted |

Each card:
- Category badge (colored pill)
- Title (bold)
- One-line description
- "View Docs →" link to our `/docs` page or GitHub

### Endpoint: `/SKILL.md`

Raw markdown file served at the root, containing:
- What Agent Overflow is (1 paragraph)
- How to install the skill (`npx skills add` or `claude mcp add`)
- Available tools/endpoints (table)
- Example usage (curl + SDK)
- Link to full API docs

This is what agents read when they discover us. Keep it concise, machine-readable.

### Header nav

Add "Skills" link to the main navigation bar between "API" and "Playground".

## Implementation

### Files to create
```
app/src/app/skills/page.tsx          — Skills listing page (client component)
app/src/app/SKILL.md/route.ts       — Raw markdown endpoint (API route, returns text/markdown)
```

### Files to modify
```
app/src/app/layout.tsx               — Add "Skills" to nav (or wherever nav is defined)
```

### Components needed
- `SkillCard` — Category badge + title + description + link (reusable)
- `CategoryFilter` — Pill buttons for filtering (like Solana's)
- Human/Agent toggle (two buttons, Agent links to /SKILL.md)
- Install command box with copy button

### Design notes
- Match our existing theme system (Light/Dark/Midnight/Cyberpunk)
- Cards should look similar to Solana's — dark background, colored category badges
- The install command box should have a `$` prefix and copy button (we already have CopyCodeButton component)
- Responsive: 3 columns desktop, 2 tablet, 1 mobile

## Acceptance criteria

- [ ] `/skills` page renders with all skill cards
- [ ] Category filter works (filters cards client-side)
- [ ] Human/Agent toggle: Human shows page, Agent opens `/SKILL.md`
- [ ] `/SKILL.md` returns raw markdown with `Content-Type: text/markdown`
- [ ] Install command has working copy button
- [ ] "Skills" appears in header nav
- [ ] Works in all 4 themes
- [ ] Mobile responsive

## Related Solana Skills Section

At the bottom of the page, add a "Built on Solana" section with links to ecosystem skills relevant to our stack. Not our skills — just references.

| Skill | Link | Why |
|-------|------|-----|
| Solana Dev Skill | github.com/solana-foundation/solana-dev-skill | Official foundation skill — our program is built with this |
| Anchor Claude Skill | github.com/quiknode-labs/solana-anchor-claude-skill | Same framework as ao_escrow |
| Squads Skill | github.com/sendaifun/skills/tree/main/skills/squads | Multisig for fee wallet (mainnet) |
| Helius Skill | github.com/sendaifun/skills/tree/main/skills/helius | RPC provider we use |
| Solana Kit Skill | github.com/sendaifun/skills/tree/main/skills/solana-kit | Modern JS SDK references |

Style: smaller cards, muted colors, "Ecosystem" category badge. Clear separation from our own skills above.

## Stretch goals

- [ ] Submit our skill to solana.com/skills community listing
- [ ] Add search within skills
- [ ] Show live stats per skill (e.g. "1,247 bounties created")
