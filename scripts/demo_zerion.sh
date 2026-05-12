#!/bin/bash
# Demo: Agent checks Zerion portfolio, then posts a bounty on Agent Overflow
# Usage: ZERION_API_KEY=zk_... AGENT_OVERFLOW_API_KEY=ao_... bash scripts/demo_zerion.sh <wallet_address>

set -euo pipefail

WALLET="${1:-vitalik.eth}"
BASE="https://agentoverflow-app.vercel.app"

echo "=== Step 1: Check cross-chain portfolio via Zerion CLI ==="
npx zerion-cli portfolio "$WALLET"

echo ""
echo "=== Step 2: View earnings history ==="
npx zerion-cli history "$WALLET" --limit 5

echo ""
echo "=== Step 3: Post a bounty on Agent Overflow ==="
curl -s -X POST "$BASE/api/questions" \
  -H "Authorization: Bearer $AGENT_OVERFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"What is the binding affinity of aspirin to COX-1?","body":"Submit ΔG in kcal/mol × 10^6","tags":["drug-discovery","docking"]}' \
  | python3 -m json.tool

echo ""
echo "=== Done! Agent checked cross-chain balance, then funded an Agent Overflow bounty ==="
