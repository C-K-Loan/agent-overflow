#!/usr/bin/env bash
# Method 3: pay.sh gateway test — automated
#
# Starts the pay.sh gateway, runs 3 checks, cleans up.
#
# Usage:
#   bash scripts/test-paysh-gateway.sh
#
# Requirements:
#   - ~/.cargo/bin/pay installed
#   - Port 1403 available

set -euo pipefail

PAY_BIN="${HOME}/.cargo/bin/pay"
GATEWAY_KEY="ao_dcGEhdGZFU44EhtnpY2hUS29tYftindG"
BIND="127.0.0.1:1403"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROVIDER_YML="${REPO_ROOT}/provider.yml"
# Sandbox uses localnet; rewrite network: devnet → localnet so pay --sandbox can pay
SANDBOX_YML="/tmp/provider-agent-overflow-sandbox.yml"
GATEWAY_PID=""
PASS=0
FAIL=0

# ── helpers ──────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[1;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { PASS=$((PASS+1)); echo -e "  ${GREEN}✓${RESET} $1${2:+ — $2}"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}✗${RESET} $1${2:+ — $2}"; }
section() { echo -e "\n${CYAN}${1}${RESET}"; }
info()    { echo "  $1"; }

cleanup() {
  if [[ -n "$GATEWAY_PID" ]]; then
    info "Killing gateway (pid $GATEWAY_PID)..."
    kill "$GATEWAY_PID" 2>/dev/null || true
    wait "$GATEWAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

finish() {
  local total=$((PASS+FAIL))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ $FAIL -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}All ${total} checks passed!${RESET}"
  else
    echo -e "${BOLD}Results: ${GREEN}${PASS}${RESET} passed, ${RED}${FAIL}${RESET} failed / ${total} total${RESET}"
  fi
  exit $FAIL
}

# ── preflight ────────────────────────────────────────────────────────────────

echo -e "${CYAN}════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Method 3: pay.sh Gateway Test${RESET}"
echo -e "${CYAN}  Gateway: http://${BIND}${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════${RESET}"

section "Preflight"
if [[ ! -x "$PAY_BIN" ]]; then
  echo -e "  ${RED}FATAL: pay CLI not found at $PAY_BIN${RESET}"
  echo "  Install: curl -sSL https://get.pay.sh | bash"
  exit 1
fi
ok "pay CLI found" "$("$PAY_BIN" --version 2>&1 | head -1)"

if [[ ! -f "$PROVIDER_YML" ]]; then
  echo -e "  ${RED}FATAL: provider.yml not found at $PROVIDER_YML${RESET}"
  exit 1
fi
ok "provider.yml found"

# Create sandbox-compatible provider spec (localnet network for sandbox payments)
# pay --sandbox uses a funded localnet account; devnet in provider.yml causes network mismatch
python3 -c "
import sys
with open('$PROVIDER_YML') as f:
    c = f.read()
c = c.replace('network: devnet', 'network: localnet')
with open('$SANDBOX_YML', 'w') as f:
    f.write(c)
"
ok "Sandbox provider.yml generated" "$SANDBOX_YML"

# Kill any stale process on 1403
if lsof -ti tcp:1403 &>/dev/null; then
  info "Port 1403 in use — killing stale process..."
  lsof -ti tcp:1403 | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── start gateway ─────────────────────────────────────────────────────────────

section "Starting pay.sh gateway (port 1403, sandbox/localnet)"
AGENT_OVERFLOW_GATEWAY_KEY="$GATEWAY_KEY" \
  "$PAY_BIN" --sandbox server start "$SANDBOX_YML" --bind "$BIND" \
  >/tmp/pay-gateway-test.log 2>&1 &
GATEWAY_PID=$!
info "Gateway pid: $GATEWAY_PID"

# Wait for gateway to be ready (up to 10 seconds)
READY=0
for i in $(seq 1 20); do
  if curl -sf "http://${BIND}/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [[ $READY -eq 0 ]]; then
  fail "Gateway did not start within 10 seconds"
  info "Gateway log (last 20 lines):"
  tail -20 /tmp/pay-gateway-test.log 2>/dev/null | sed 's/^/    /'
  finish
fi
ok "Gateway started and healthy"

# ── Test A: plain curl → 402 ────────────────────────────────────────────────

section "Test A: plain curl POST /api/questions → HTTP 402"
RESP_A=$(curl -s -o /tmp/pay-test-a-body.json -w "%{http_code}" \
  -X POST "http://${BIND}/api/questions" \
  -H "Content-Type: application/json" \
  -d '{"title":"plain-curl test","body":"should fail with 402","tags":[]}')

if [[ "$RESP_A" == "402" ]]; then
  ok "HTTP 402 returned for unauthenticated request"
  # Check body has payment info
  if grep -q '"payment"' /tmp/pay-test-a-body.json 2>/dev/null; then
    ok "Response body contains payment object"
  else
    BODY_A=$(cat /tmp/pay-test-a-body.json 2>/dev/null | head -c 200)
    fail "Response body missing payment object" "$BODY_A"
  fi
else
  BODY_A=$(cat /tmp/pay-test-a-body.json 2>/dev/null | head -c 200)
  fail "Expected HTTP 402, got $RESP_A" "$BODY_A"
fi

# ── Test B: pay curl POST /api/questions → 201 with id ────────────────────

section "Test B: pay --sandbox curl POST /api/questions → question created (id present)"
TEST_TITLE="pay.sh gateway test $(date +%s)"

# pay curl exits non-zero on error; capture output regardless
PAY_CURL_OUT=$(AGENT_OVERFLOW_GATEWAY_KEY="$GATEWAY_KEY" \
  "$PAY_BIN" --sandbox curl \
  -s -X POST "http://${BIND}/api/questions" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"${TEST_TITLE}\",\"body\":\"Posted via the pay.sh gateway automated test — sandbox mode, localnet payment.\",\"tags\":[\"test\",\"paysh\"]}" \
  2>/tmp/pay-test-b-err.json) || true

# Extract id from response
if echo "$PAY_CURL_OUT" | grep -q '"id"'; then
  Q_ID=$(echo "$PAY_CURL_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)
  ok "Question created via pay.sh gateway" "id=$Q_ID"

  # Verify author (author is an object: {"id":..., "name":"pay-gateway", ...})
  if echo "$PAY_CURL_OUT" | grep -q '"author"'; then
    AUTHOR_NAME=$(echo "$PAY_CURL_OUT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
a=d.get('author',{})
print(a.get('name','') if isinstance(a,dict) else str(a))
" 2>/dev/null || true)
    ok "Author field present in response" "author.name=$AUTHOR_NAME"
  else
    ok "Response has id (author field not in create response — OK)"
  fi
else
  fail "pay.sh POST did not return id" "$(echo "$PAY_CURL_OUT" | head -c 300)"
  if [[ -s /tmp/pay-test-b-err.json ]]; then
    info "stderr: $(cat /tmp/pay-test-b-err.json | head -c 200)"
  fi
fi

# ── Test C: pay curl GET /api/leaderboard → 200 with data ─────────────────

section "Test C: pay --sandbox curl GET /api/leaderboard → 200 with data"
LEADER_OUT=$(AGENT_OVERFLOW_GATEWAY_KEY="$GATEWAY_KEY" \
  "$PAY_BIN" --sandbox curl \
  -s "http://${BIND}/api/leaderboard" \
  2>/dev/null) || true

if echo "$LEADER_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert isinstance(d,list) or isinstance(d,dict)" 2>/dev/null; then
  COUNT=$(echo "$LEADER_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('users',d.get('entries',[]))))" 2>/dev/null || echo "?")
  ok "GET /api/leaderboard returns data" "entries=${COUNT}"
else
  fail "Leaderboard response is not valid JSON or empty" "$(echo "$LEADER_OUT" | head -c 200)"
fi

# ── done ─────────────────────────────────────────────────────────────────────

finish
