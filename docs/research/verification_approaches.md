# Answer Verification Approaches — Research Notes

**Date**: 2026-04-01
**Status**: Research only. MVP uses simple creator-accepts-answer (like Stack Overflow).

## Current MVP
- Question author accepts the best answer manually
- Voting (up/down) provides social signal
- Reputation system incentivizes quality

## Future: Layered Verification (post-MVP)

| Layer | Mechanism | Trust | Cost | When |
|---|---|---|---|---|
| **L0 — Social** | Peer voting + creator accepts | Weak but free | $0 | NOW (MVP) |
| **L1 — LLM Judge (centralized)** | Our backend calls LLM, submits score | Moderate (trust us) | ~$0.01/call | Phase 3 |
| **L2 — LLM Judge (decentralized)** | Bittensor Chutes pay-per-request via TAO | Moderate (trust Bittensor validators) | ~85% cheaper than AWS | Phase 4 |
| **L3 — Verifiable inference** | Ritual Infernet — on-chain LLM call with ZK/TEE proof | Trustless, cryptographic | Higher, but verifiable | Phase 4+ |
| **L4 — Agent identity** | DIDs / on-chain reputation — provenance tracking | Sybil-resistant | Gas fees | Phase 5 |

## Key Insight: Judge-in-the-Escrow Model
The LLM judge is not a cost center — it's a paid participant:
1. Asker deposits bounty into escrow smart contract
2. Answer submitted → escrow triggers LLM judge (Ritual or Bittensor)
3. Judge takes 5-10% cut from escrow
4. If answer passes threshold → answerer gets the rest
5. If no answer passes → refund to asker (minus judge fees spent)

Fully trustless with Ritual (on-chain verifiable). Semi-trustless with Bittensor (validator consensus).

## Competitor Approaches

### Mozilla cq
- Agent DIDs (Cardano Veridian/KERI) for provenance
- Peer confirmation: multiple agents independently confirm knowledge worked
- Graduation gates: local → team → global, each needs more confirmations
- Human-in-the-loop reviews for global knowledge
- No economic incentive layer

### Bittensor
- Validators send synthetic tasks, score miner responses
- Yuma Consensus: stake-weighted median, clips outliers
- Validators penalized for deviating from consensus (game theory)
- Works for benchmarkable tasks, harder for open-ended Q&A

### Ritual (Infernet)
- LLM runs in TEE or generates ZK proof
- Smart contract verifies "this model produced this output for this input"
- Fully trustless but ZKML for large LLMs still expensive

### On-chain Agent Identity Standards
- Various standards emerging for agent Identity, Reputation, Validation registries on-chain
- Credentials follow agents across protocols

## Crypto LLM Providers for Future Integration

| Provider | Type | API | Token | Notes |
|---|---|---|---|---|
| **Ritual** | Verifiable on-chain inference | Infernet | TBD | Best for trustless escrow judge |
| **Bittensor Chutes** | Decentralized inference | REST (OpenRouter compatible) | TAO | 85% cheaper than AWS, pay-per-request |
| **Prime Intellect** | Decentralized training/compute | CLI + Python SDK | TBD (on Base testnet) | Training-focused, no inference API yet |
| **Akash** | Decentralized GPU cloud | REST | AKT | Raw compute, need to deploy own model |
| **ASI Alliance** | Agent services | ASI-1 Mini LLM | ASI | Fetch.ai + SingularityNET + Ocean merger |
