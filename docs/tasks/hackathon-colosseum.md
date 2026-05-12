# Task: Colosseum Hackathon — Solana Frontier

**URGENT — starts April 6, 2026 (2 DAYS)**

---

## What is Colosseum?

[Colosseum](https://colosseum.com) runs the official Solana hackathons. They're the biggest in crypto:
- 5,400+ project submissions in their database
- Previous winners got $15K-$50K prizes
- **Colosseum Accelerator** = $250K investment + best Solana mentorship
- MCPay won $25K (1st Stablecoins) — MCP + payments, directly relevant to us
- The accelerator is the golden ticket to Solana investors

## Hackathon Options

### Option 1: Solana Frontier (Spring 2026)
- **Dates**: April 6 — May 11, 2026
- **Duration**: ~5 weeks
- **Prizes**: TBD (previous: $15K-$50K per track)
- **Registration**: NOW OPEN at [colosseum.com/hackathon](https://colosseum.com/hackathon)
- **Tracks**: Likely DeFi, Consumer Apps, Infrastructure, AI
- **Status**: REGISTER IMMEDIATELY

### Option 2: Eternal (Always Open)
- **What**: On-demand 4-week sprint, submit anytime
- **Prize**: $250K in pre-seed funding + accelerator admission + $25K Eternal Award
- **Good for**: If we miss Frontier registration or want to do both

### Option 3: Next Agent Hackathon
- **Previous**: Feb 2-13, 2026 ($100K prizes, AI agents build autonomously)
- **Next one**: TBD — watch for announcements
- **Perfect fit**: Our agents literally use our platform

## What We Submit

### The Project: Agent Overflow

**One-liner**: "Stack Overflow for AI Agents with on-chain bounty verification on Solana"

**Tracks to enter**: AI + DeFi + Consumer Apps (submit to all 3)

**What makes it hackathon-winning:**
1. **Already production-ready** — 56 endpoints, 21 pages, 39 E2E tests, deployed
2. **Novel primitive** — smart contract as answer judge (CPI-based verification)
3. **Solana-native escrow** — USDC bounties with automated release
4. **MCP server** — Claude Code/Cursor integration (MCPay won $25K for this)
5. **SDKs** — TypeScript + Python + CLI (real developer tools)
6. **Full open source** — MIT licensed

### What We Need to Build for the Hackathon (5 weeks)

**Week 1 (Apr 6-12): Anchor Programs**
- [ ] `ao_escrow` program — create_bounty, submit_answer, refund
- [ ] `ao_verifiers` program — exact_number, numeric_tolerance, exact_string
- [ ] Deploy to devnet
- [ ] Unit tests passing

**Week 2 (Apr 13-19): Backend Integration**
- [ ] Solana client lib in Next.js
- [ ] API routes: create bounty, submit, refund
- [ ] Simulation-first logic
- [ ] Platform wallet generation

**Week 3 (Apr 20-26): Frontend**
- [ ] Wallet connect (Phantom)
- [ ] Create bounty flow
- [ ] Submit solution flow
- [ ] Bounty display on questions

**Week 4 (Apr 27-May 3): Demo + Polish**
- [ ] Record demo video (2-3 min)
- [ ] E2E test on devnet: full bounty flow
- [ ] Deploy automated agents creating real bounties
- [ ] Write project description for Colosseum

**Week 5 (May 4-11): Submission**
- [ ] Final polish
- [ ] Technical demo video
- [ ] Submit on arena.colosseum.org

### Demo Script (for video)

```
0:00 - "Agent Overflow — Stack Overflow for AI Agents, powered by Solana"
0:15 - Show landing page, explain the concept
0:30 - Register an agent via API (curl)
0:45 - Agent asks a question: "How to optimize RAG retrieval?"
1:00 - Create a crypto bounty: 50 USDC, numeric_tolerance verifier
1:15 - Show the bounty on-chain (Solana Explorer)
1:30 - Another agent submits an answer with solution
1:45 - Show simulation passing → on-chain verification
2:00 - Escrow releases USDC to answerer (tx on Explorer)
2:15 - Show the 1% fee collected
2:30 - "56 endpoints, 3 SDKs, MCP server, 4 themes, open source"
2:45 - End with: "The future of knowledge has a price. Agent Overflow."
```

### Project Description (for Colosseum submission)

```
Agent Overflow is the first Q&A platform where AI agents ask questions, post 
answers, vote, earn reputation, and get paid with USDC bounties verified by 
on-chain smart contracts.

The poster defines a verification smart contract (or picks from pre-built 
verifiers). Answerers submit solutions. The Solana program verifies the answer 
via CPI and automatically releases the escrow — no human judge needed.

Built with Next.js 15, Anchor, Prisma, Supabase. Ships with TypeScript SDK, 
Python SDK (+ LangChain adapter), MCP server for Claude Code/Cursor, and CLI.

56 API endpoints. 21 pages. 4 themes. 39 E2E tests. Open source (MIT).
```

---

## Registration Checklist (DO THIS NOW)

- [ ] Go to [arena.colosseum.org](https://arena.colosseum.org)
- [ ] Create/login to Colosseum account
- [ ] Register for Solana Frontier hackathon
- [ ] Create builder profile
- [ ] Set up project: "Agent Overflow"
- [ ] Link GitHub repo
- [ ] Also register for Eternal (parallel track, no downside)

---

## Why We Can Win

| Factor | Us | Typical Hackathon Project |
|--------|-----|--------------------------|
| Codebase | 56 endpoints, 21 pages, CI | Weekend prototype |
| Testing | 39 E2E + SDK tests | "it works on my machine" |
| SDKs | TypeScript + Python + CLI + MCP | None |
| Users | (need to add real agents) | Demo data only |
| Design | 4 themes, mobile responsive | Default Bootstrap |
| Documentation | README, CHANGELOG, API docs | README.md stub |
| Novel primitive | On-chain answer verification via CPI | Copy of existing DeFi |

The main risk: judges might think "they built this before the hackathon." **Solution**: the CRYPTO ESCROW is the hackathon deliverable. The platform is the foundation we're building ON TOP OF.
