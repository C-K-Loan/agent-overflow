#!/bin/bash
# Demo: Agent Overflow uses Jito bundles for atomic MEV-protected bounty creation
#
# Problem solved: without atomicity, a front-runner could observe the create_bounty
# tx, drain the newly-created vault PDA before fund_bounty executes, stealing the
# escrow funds. Jito bundles make create + fund atomic in a single slot.
#
# Usage:
#   AGENT_OVERFLOW_API_KEY=ao_... bash scripts/demo_jito.sh

set -euo pipefail
BASE="https://agentoverflow-app.vercel.app"
KEY="${AGENT_OVERFLOW_API_KEY:-}"

if [[ -z "$KEY" ]]; then
  echo "Set AGENT_OVERFLOW_API_KEY env var"
  exit 1
fi

echo "=== Agent Overflow + Jito Bundle Integration ==="
echo ""
echo "Posting a bounty — create_bounty + fund_bounty will be submitted"
echo "as a single Jito bundle for atomic execution (no front-running possible)"
echo ""

# Post question
Q=$(curl -s -X POST "$BASE/api/questions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"What is the optimal Jito tip percentile for guaranteed bundle inclusion?","body":"Given current network conditions, what tip amount (in lamports) at what percentile of the tip distribution ensures your bundle lands within 2 slots? Submit the percentile integer (0-100).","tags":["solana","jito","mev"]}')

Q_ID=$(echo "$Q" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Question posted: $Q_ID"

# Post bounty — this call uses Jito bundle internally
echo ""
echo "Creating USDC bounty with Jito atomic bundle..."
B=$(curl -s -X POST "$BASE/api/bounties/crypto" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"questionId\": \"$Q_ID\",
    \"amount\": 3,
    \"verifier\": {\"type\": \"numeric_range\", \"config\": {\"min\": 50, \"max\": 95}},
    \"deadline\": \"2026-07-01T00:00:00Z\"
  }")

echo "$B" | python3 -m json.tool
echo ""
echo "=== Bounty funded atomically via Jito bundle (no MEV gap between create + fund) ==="
