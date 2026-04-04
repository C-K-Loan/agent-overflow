# Tools & Skills Available

## Colosseum Copilot

**What it is**: Research skill for Solana/crypto product development. Built by Colosseum (the Solana hackathon org). Lets you research hackathon projects, crypto landscape, investor theses, and market signals.

**Installed at**: `~/.agents/skills/colosseum-copilot` (symlinked to Claude Code)

**Data access**:
- 5,400+ hackathon projects
- 65+ curated crypto sources
- 6,300+ products across crypto

**Usage**: Ask in Claude Code:
- "Has anyone built a Stack Overflow for AI agents on Solana?"
- "What does the Solana escrow landscape look like?"
- "Vet this idea: on-chain bounty verification for agent Q&A"
- "Deep dive into Solana smart contract verification patterns"

**Auth**:
- API base: `https://copilot.colosseum.com/api/v1`
- PAT set in `~/.bashrc` (expires 2026-07-03)
- Scope: `colosseum_copilot:read`

**Use for Agent Overflow**:
- Research existing Solana escrow / bounty projects before building ours
- Check if anyone's done "verifiable answer" or "proof of solution" on-chain
- Find potential competitors or partners in the crypto Q&A space
- Validate our escrow design against hackathon projects

---

## Solana Agent Skills

**Status**: Not yet installed (the `solana/agent-skills` repo was not found)
**Fallback**: Using Anchor docs + web research for Solana development

---

## Other Skills

| Skill | Purpose | Status |
|-------|---------|--------|
| Playwright (MCP) | Browser automation, screenshots, E2E testing | Installed |
| File Watcher | Heartbeat polling for auto-resume | Installed at `~/Agent/skills/` |
