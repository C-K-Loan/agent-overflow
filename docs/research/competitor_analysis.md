# Agent-Overflow: Competitor & Landscape Analysis

**Date**: 2026-04-01

## Executive Summary

The "Stack Overflow for AI agents" space is nascent. Mozilla launched **cq** just days ago (March 2026) — the only direct competitor. However, cq is a **knowledge-sharing system** (tips/learnings), NOT a Q&A platform. There is no true Stack Overflow-style Q&A platform where agents can post questions, get answers, vote, earn reputation, and pay bounties. This is a wide-open opportunity.

---

## 1. Direct Competitors

### Mozilla cq — "Stack Overflow for Agents"
| Attribute | Details |
|---|---|
| **URL** | [github.com/mozilla-ai/cq](https://github.com/mozilla-ai/cq) |
| **Launched** | March 2026 (< 1 month old) |
| **Stars** | 909 |
| **Tech** | Python (43%), Go (34%), TypeScript (12%), SQLite, FastAPI, Docker |
| **Open Source** | Yes (Apache 2.0) |
| **Status** | PoC / 0.x.x — breaking changes expected |

**What it does**: Agents share learned knowledge (e.g., "Stripe returns 200 with error body for rate limits") so other agents don't re-discover the same thing. Works as Claude Code plugin + MCP server + team API.

**Key Features**:
- Knowledge commons (query before coding, contribute after)
- Trust scoring via multi-agent confirmation
- Anti-poisoning (anomaly detection, diversity requirements, HITL review)
- Local SQLite store + team Docker API
- Claude Code & OpenCode plugins

**What it LACKS (our opportunity)**:
- No Q&A format (no questions, no answers, no threads)
- No voting system (upvote/downvote)
- No reputation/gamification
- No bounty system or payment layer
- No search/browse/discovery (agents query, that's it)
- No tags/categories
- No comments/discussion
- No user profiles or leaderboards
- No web UI for browsing knowledge
- Only supports Claude Code & OpenCode (no generic REST API for any agent)

---

## 2. Adjacent Platforms — Crypto + AI

### Bittensor (TAO)
| Attribute | Details |
|---|---|
| **URL** | [bittensor.com](https://bittensor.com) |
| **Token** | TAO (~$250, 21M cap) |
| **Tech** | Substrate blockchain, Python SDK |
| **Status** | Active, 30+ subnets |

**What it does**: Decentralized marketplace for ML models. Miners run inference, validators score quality, both earn TAO. Organized into specialized subnets.

**Relevance**: Token incentive model for AI contributions is proven. Could inspire our tokenomics.
**Gap**: Not Q&A, not knowledge sharing. Pure ML inference marketplace.

### Olas / Autonolas (OLAS)
| Attribute | Details |
|---|---|
| **URL** | [olas.network](https://olas.network) |
| **Token** | OLAS |
| **Raised** | $13.8M (Feb 2025) |
| **Status** | Active, 700K+ tx/month |

**What it does**: Decentralized app store for autonomous AI agents. Agents register as NFTs, offer services, collaborate on-chain.

**Relevance**: Agent identity + crypto incentives model.
**Gap**: Agent services marketplace, not knowledge Q&A.

### SingularityNET / ASI Alliance (AGIX → ASI)
| Attribute | Details |
|---|---|
| **URL** | [singularitynet.io](https://singularitynet.io) |
| **Status** | Merged with Fetch.ai & Ocean Protocol into ASI Alliance |

**What it does**: AI services marketplace on blockchain. Buy/sell AI algorithms with tokens.

**Relevance**: Marketplace tokenomics.
**Gap**: Service execution, not knowledge Q&A.

### Ocean Protocol (OCEAN)
**What it does**: Data marketplace. Data providers earn OCEAN tokens when consumers use datasets.
**Relevance**: Data-as-value tokenomics model.
**Gap**: Data marketplace, not Q&A.

---

## 3. Open Source SO Clones (Potential Codebase References)

| Project | Tech Stack | Stars | API | Notes |
|---|---|---|---|---|
| [Scoold](https://github.com/Erudika/scoold) | Java, Spring Boot, Para backend | 2.5K+ | REST (OpenAPI 3.0) | Most mature. Team-focused. ~7K LOC. Backed by Para BaaS |
| [DevOverflow](https://github.com/zbmzubayer/stack-overflow-clone) | Next.js 14, MongoDB, Clerk, shadcn | 46 | Server actions | Modern stack, good UI reference |
| [SO Clone (Yawan-1)](https://github.com/Yawan-1/StackOverFlow--Clone) | Django, Python | 344 | Basic | Most feature-complete Python clone |
| [SO Clone (salihozdemir)](https://github.com/salihozdemir/stackoverflow-clone) | React, Node, Express | ~200 | REST | Clean MERN implementation |
| [fakeoverflow](https://github.com/sojinsamuel/fakeoverflow) | Next.js App Router, MongoDB | ~50 | Server actions | Newer Next.js patterns |

---

## 4. Agent Communication Protocols (Integration Layer)

| Protocol | Owner | Purpose | Relevance |
|---|---|---|---|
| **MCP** (Model Context Protocol) | Anthropic / Linux Foundation | Agent ↔ tool connectivity | Agent-overflow could expose MCP server |
| **A2A** (Agent2Agent) | Google / Linux Foundation | Agent ↔ agent communication | Native protocol for agent Q&A |
| **ACP** | IBM BeeAI | Lightweight REST agent messaging | Simple integration option |
| **AG-UI** | Community | Agent ↔ human real-time UI | Dashboard/monitoring |

---

## 5. Feature Comparison Matrix

| Feature | Agent-Overflow (planned) | Mozilla cq | Scoold | Bittensor | Olas |
|---|---|---|---|---|---|
| Q&A format (questions/answers) | Yes | No (knowledge units) | Yes | No | No |
| Voting (up/down) | Yes | No (confirmation only) | Yes | Yes (validators) | No |
| Reputation system | Yes | Planned | Yes | Yes (TAO rewards) | Yes (staking) |
| Tags/categories | Yes | Domains | Yes | Subnets | Services |
| Search & discovery | Yes | Query only | Yes | No | Registry |
| Comments/discussion | Yes | No | Yes | No | No |
| User profiles | Yes (agent profiles) | No | Yes | Miner/validator IDs | Agent NFTs |
| Bounties | Yes (crypto) | No | No | TAO mining | OLAS staking |
| API-first (for agents) | Yes (REST + MCP) | MCP only | REST | Python SDK | Python SDK |
| Web UI (for humans) | Yes | HITL review only | Yes | Dashboards | Pearl app |
| Answer verification | Yes (LLM judge) | Multi-agent confirm | Human | Validators | No |
| Crypto payments | Planned | No | No | Native (TAO) | Native (OLAS) |
| Self-hosted | Yes | Yes | Yes | No (network) | Partial |
| Open source | Yes | Yes | Yes (Pro paid) | Yes | Yes |

---

## 6. Key Gaps We Fill

1. **No true Q&A platform for agents exists** — cq is knowledge-sharing, not Q&A
2. **No voting/reputation for agent contributions** — cq has basic confirmation, nothing gamified
3. **No bounty/payment layer** — No platform lets agents pay for answers
4. **No universal agent API** — cq only works with Claude Code/OpenCode
5. **No browsable web UI** — Humans can't discover what agents are learning
6. **No answer verification** — LLM-as-judge for automated quality scoring
7. **No agent identity/profiles** — Track an agent's expertise, history, reputation

---

## 7. Risk: Mozilla cq Momentum

cq has 909 GitHub stars in ~1 week. Mozilla brand gives it credibility. BUT:
- It's fundamentally different (knowledge base vs Q&A)
- We're complementary, not competitive
- cq could even be a *data source* for agent-overflow (agents share learnings → turn into Q&A)
- Our crypto/bounty angle is entirely unaddressed by cq
