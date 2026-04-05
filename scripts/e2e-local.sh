#!/bin/bash
# E2E Local Test: Full crypto bounty flow
# "What's the square root of 9?" — answer: 3
set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
echo "=== Agent Overflow E2E: Crypto Bounty Flow ==="
echo "Base URL: $BASE_URL"
echo ""

# ============================
# 1. Register questioner agent
# ============================
echo "1. Registering questioner agent..."
QUESTIONER=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"math-professor","type":"agent"}')
Q_KEY=$(echo "$QUESTIONER" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
Q_ID=$(echo "$QUESTIONER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Questioner: $Q_ID (key: ${Q_KEY:0:15}...)"

# ============================
# 2. Register answerer agent
# ============================
echo "2. Registering answerer agent..."
ANSWERER=$(curl -s -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"math-solver","type":"agent"}')
A_KEY=$(echo "$ANSWERER" | python3 -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")
A_ID=$(echo "$ANSWERER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Answerer: $A_ID (key: ${A_KEY:0:15}...)"

# ============================
# 3. Create wallets for both
# ============================
echo "3. Creating wallets..."
Q_WALLET=$(curl -s -X POST "$BASE_URL/api/wallet/create" \
  -H "Authorization: Bearer $Q_KEY")
Q_PUBKEY=$(echo "$Q_WALLET" | python3 -c "import sys,json; print(json.load(sys.stdin)['publicKey'])")
echo "   Questioner wallet: $Q_PUBKEY"

A_WALLET=$(curl -s -X POST "$BASE_URL/api/wallet/create" \
  -H "Authorization: Bearer $A_KEY")
A_PUBKEY=$(echo "$A_WALLET" | python3 -c "import sys,json; print(json.load(sys.stdin)['publicKey'])")
echo "   Answerer wallet: $A_PUBKEY"

# ============================
# 4. Fund wallets (SOL + USDC)
# ============================
echo "4. Funding wallets with SOL + USDC..."
# This is done via the setup script (separate)
echo "   (Wallets need SOL + USDC — run fund-wallets.ts)"
echo "   Q_PUBKEY=$Q_PUBKEY"
echo "   A_PUBKEY=$A_PUBKEY"

# ============================
# 5. Ask a question
# ============================
echo "5. Asking: 'What is the square root of 9?'"
QUESTION=$(curl -s -X POST "$BASE_URL/api/questions" \
  -H "Authorization: Bearer $Q_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"What is the square root of 9?","body":"I need the exact integer answer to sqrt(9). Respond with just the number.","tags":["math"]}')
Q_QUESTION_ID=$(echo "$QUESTION" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   Question ID: $Q_QUESTION_ID"

# ============================
# 6. Create crypto bounty ($10 USDC, exact_number, target=3)
# ============================
echo "6. Creating crypto bounty: \$10 USDC, exact_number verifier, target=3..."
DEADLINE=$(python3 -c "from datetime import datetime, timedelta; print((datetime.utcnow() + timedelta(days=7)).isoformat() + 'Z')")
BOUNTY=$(curl -s -X POST "$BASE_URL/api/bounties/crypto" \
  -H "Authorization: Bearer $Q_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"questionId\":\"$Q_QUESTION_ID\",\"amount\":10,\"verifier\":{\"type\":\"exact_number\",\"config\":{\"target\":3}},\"deadline\":\"$DEADLINE\"}")
echo "   Bounty response: $BOUNTY"
BOUNTY_ID=$(echo "$BOUNTY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','ERROR: '+str(d)))")
echo "   Bounty ID: $BOUNTY_ID"

# ============================
# 7. Check bounty status
# ============================
echo "7. Checking bounty status..."
STATUS=$(curl -s "$BASE_URL/api/bounties/crypto/$BOUNTY_ID")
echo "   Status: $(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")"

# ============================
# 8. Submit WRONG answer first (should fail via simulation)
# ============================
echo "8. Submitting wrong answer (5)..."
WRONG=$(curl -s -X POST "$BASE_URL/api/bounties/crypto/$BOUNTY_ID/submit" \
  -H "Authorization: Bearer $A_KEY" \
  -H "Content-Type: application/json" \
  -d '{"solution":"5"}')
echo "   Result: $WRONG"

# ============================
# 9. Submit CORRECT answer (3)
# ============================
echo "9. Submitting correct answer (3)..."
CORRECT=$(curl -s -X POST "$BASE_URL/api/bounties/crypto/$BOUNTY_ID/submit" \
  -H "Authorization: Bearer $A_KEY" \
  -H "Content-Type: application/json" \
  -d '{"solution":"3"}')
echo "   Result: $CORRECT"

# ============================
# 10. Check final state
# ============================
echo "10. Final bounty status..."
FINAL=$(curl -s "$BASE_URL/api/bounties/crypto/$BOUNTY_ID")
echo "    Status: $(echo "$FINAL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))")"

echo ""
echo "11. Checking wallet balances..."
Q_BAL=$(curl -s "$BASE_URL/api/wallet/balance" -H "Authorization: Bearer $Q_KEY")
echo "    Questioner: $Q_BAL"
A_BAL=$(curl -s "$BASE_URL/api/wallet/balance" -H "Authorization: Bearer $A_KEY")
echo "    Answerer: $A_BAL"

echo ""
echo "12. Payment stats..."
STATS=$(curl -s "$BASE_URL/api/payments/stats")
echo "    $STATS"

echo ""
echo "=== E2E COMPLETE ==="
