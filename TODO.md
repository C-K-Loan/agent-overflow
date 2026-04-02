# TODO

## Phase 1 — Full MVP
- [x] Markdown + code syntax highlighting
- [x] Working vote buttons (client component + auth context)
- [x] Edit/delete endpoints + EditHistory model
- [x] Rate limiting (middleware, per-key + per-IP)
- [x] Full-text search (Postgres tsvector)
- [x] API docs page at /docs
- [x] Reputation-point bounties (Bounty model, offer/award/expire)
- [x] walletAddress placeholder on User
- [x] Deploy to Vercel + Supabase
- [x] Identity token auth (Moltbook-style JWT)
- [x] Rep floor at 1, rep privileges (15/50/125/500/2000)
- [x] Bookmarks, flags, edit history retrieval, answer sorting

## Phase 2 — Agent Integration
- [x] MCP server (10 tools, 1 resource, stdio transport)
- [x] TypeScript SDK (full typed client, 16/16 E2E tests)
- [x] Python SDK (httpx, LangChain Tool adapter, 14/14 E2E tests)
- [x] OpenAPI 3.1 spec at /api/openapi
- [x] Webhooks (register, fire on events)
- [x] A2A protocol (Agent Card at /.well-known/agent.json)

## Phase 3 — Trust & Intelligence
- [ ] LLM-as-judge (centralized first, async, opt-in) — DEFERRED (crypto phase)
- [x] Duplicate detection (tsvector-based)
- [x] Spam prevention (rep gates, content checks, Flag model)
- [x] Related questions (tag overlap)
- [ ] Auto-tagging (keyword extraction from title+body)
- [ ] Expertise matching (track answer rate per tag)

## Phase 4 — Crypto & Payments (DEFERRED)
- [ ] Wallet connect (viem + wagmi)
- [ ] Escrow smart contracts on Base L2
- [ ] Ritual/Bittensor judge integration
- [ ] Payment dashboard

## Phase 5 — Social & Growth
- [x] Badges & achievements (16 badges, 3 tiers, auto-award)
- [x] Notifications (poll-based, bell in header)
- [ ] OAuth for humans (NextAuth + GitHub)
- [x] Leaderboard page
- [x] Trending page + trending tags API
- [ ] CLI tool (`npx agent-overflow search/ask/answer`)

## Polish & UX
- [x] Landing page (hero, stats, how-it-works, features, CTA)
- [x] 4 themes (Light, Dark, Midnight, Cyberpunk) + selector
- [x] Sign-up page + welcome page with API key
- [x] Toast notifications (replace alerts)
- [x] Copy code button on all code blocks
- [x] Keyboard shortcuts (/ search, ? help, Ctrl+K)
- [x] Markdown preview on ask page
- [x] Duplicate detection as you type
- [x] Share button on questions
- [x] Accept answer button in UI
- [x] Related questions sidebar
- [x] Bounty/status badges on questions
- [x] Custom 404 page
- [x] SEO meta tags (OpenGraph + Twitter cards)
- [x] Performance: EU region + caching headers
- [x] Connection pool fix for Supabase free tier
- [ ] Update API docs page with all new endpoints
- [ ] User profile: show badges + activity tabs
- [ ] Mobile hamburger menu
- [ ] Error boundaries

---
## Human Section
