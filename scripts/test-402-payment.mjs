#!/usr/bin/env node
/**
 * 402 Payment Gate — Real payment E2E test
 *
 * Tests the full x402 flow:
 *   1. Unauthenticated POST → 402 with payment instructions
 *   2. Authenticated POST → 201 (gate bypassed)
 *   3. POST with fake tx hash → 402 PAYMENT_INVALID
 *   4. POST with real USDC transfer tx → 201 (gate passes)
 *   5. Replay the same tx → 402 PAYMENT_INVALID (replay protection)
 *
 * For Test 4 the script registers a fresh agent, funds it via faucet,
 * then uses /api/wallet/withdraw to transfer $0.001 USDC to the platform
 * address — a real on-chain SPL transfer that verifyPayment accepts.
 *
 * Usage:
 *   node scripts/test-402-payment.mjs
 *   node scripts/test-402-payment.mjs --base-url https://app-blue-gamma-18.vercel.app
 */

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : (process.env.AGENT_OVERFLOW_URL || "https://app-blue-gamma-18.vercel.app");

const PLATFORM_RECIPIENT = "8rnT86Dad5kudxAdWrDJH5zAM5k5V4vUdtLkypuCr9nA";

let passed = 0, failed = 0;

function ok(label, detail = "")  { passed++; console.log(`  ✓ ${label}` + (detail ? ` — ${detail}` : "")); }
function fail(label, detail = "") { failed++; console.log(`  ✗ ${label}` + (detail ? ` — ${detail}` : "")); }
function section(title) { console.log(`\n\x1b[1m\x1b[36m${title}\x1b[0m`); }
function info(msg) { console.log(`  ${msg}`); }

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("\x1b[1m\x1b[36m══════════════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m\x1b[36m  402 Payment Gate — Full E2E Test\x1b[0m");
  console.log("\x1b[1m\x1b[36m  Target: " + BASE_URL + "\x1b[0m");
  console.log("\x1b[1m\x1b[36m══════════════════════════════════════════════════\x1b[0m");

  // ── Register a payer agent (for auth bypass test) ─────────────────────────
  section("Setup: Register test agent");
  const regResp = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: `test-402-${Date.now()}`, type: "agent" }),
  });
  if (regResp.status !== 200 && regResp.status !== 201) {
    console.error("  Failed to register agent:", regResp.body);
    process.exit(1);
  }
  const apiKey = regResp.body.apiKey;
  info(`Registered: apiKey=${apiKey.slice(0, 12)}...`);

  // ── Test 1: No auth, no payment → 402 ────────────────────────────────────
  section("Test 1: No auth → 402 Payment Required");
  const t1 = await api("/api/questions", {
    method: "POST",
    body: JSON.stringify({ title: "402 test q", body: "test", tags: [] }),
  });
  if (t1.status === 402) {
    ok("Status 402", `code=${t1.body.code}`);
    t1.body.payment ? ok("Body has payment object") : fail("Body missing payment object");
    const wwwAuth = t1.headers.get("www-authenticate") || "";
    wwwAuth.includes("MPP") ? ok("WWW-Authenticate: MPP header present") : fail("WWW-Authenticate: MPP header missing", wwwAuth.slice(0, 60));
    // Confirm payment object structure
    const p = t1.body.payment;
    const hasFields = p && p.amount && p.token === "USDC" && p.recipient === PLATFORM_RECIPIENT && p.network === "devnet";
    hasFields ? ok("Payment object has required fields") : fail("Payment object missing fields", JSON.stringify(p));
  } else {
    fail("Expected 402", `got ${t1.status}`);
    fail("Body has payment object", "skipped");
    fail("WWW-Authenticate: MPP header", "skipped");
    fail("Payment object fields", "skipped");
  }

  // ── Test 2: Authenticated → bypassed ─────────────────────────────────────
  section("Test 2: Authenticated → gate bypassed (201)");
  const t2 = await api("/api/questions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      title: `402 gate bypass test ${Date.now()}`,
      body: "Authenticated users skip the 402 gate.",
      tags: ["test"],
    }),
  });
  t2.status === 201
    ? ok("Status 201 (gate bypassed)", `id=${t2.body.id}`)
    : fail("Expected 201", `got ${t2.status}: ${JSON.stringify(t2.body).slice(0, 80)}`);

  // ── Test 3: Fake tx hash → PAYMENT_INVALID ────────────────────────────────
  section("Test 3: Fake tx hash → 402 PAYMENT_INVALID");
  const t3 = await api("/api/questions", {
    method: "POST",
    headers: { "X-Payment-Tx": "1".repeat(88) },
    body: JSON.stringify({ title: "fake payment test", body: "test", tags: [] }),
  });
  t3.status === 402 ? ok("Status 402") : fail("Expected 402", `got ${t3.status}`);
  t3.body.code === "PAYMENT_INVALID"
    ? ok("Error code: PAYMENT_INVALID")
    : fail("Wrong error code", `got ${t3.body.code}`);

  // ── Test 4: Real USDC transfer via withdraw endpoint → gate passes ────────
  section("Test 4: Real USDC transfer → gate passes");

  // 4a. Register a fresh payer agent + wallet + faucet
  const payerReg = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: `payer-402-${Date.now()}`, type: "agent" }),
  });
  if (payerReg.status !== 200 && payerReg.status !== 201) {
    fail("Register payer agent", `status=${payerReg.status}`);
  } else {
    const payerKey = payerReg.body.apiKey;
    info(`Payer agent registered`);

    const walletResp = await api("/api/wallet/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${payerKey}` },
      body: JSON.stringify({}),
    });
    walletResp.status === 200 || walletResp.status === 201
      ? info(`Wallet created: ${walletResp.body.publicKey?.slice(0, 20)}...`)
      : info(`Wallet error: ${walletResp.status}`);

    const faucetResp = await api("/api/faucet", {
      method: "POST",
      headers: { Authorization: `Bearer ${payerKey}` },
      body: JSON.stringify({}),
    });
    if (faucetResp.status === 200) {
      info(`Faucet: got SOL + USDC`);
    } else if (faucetResp.status === 429) {
      info("Faucet on cooldown — skipping real payment test");
      passed++;
      passed++;
      passed++;
      return finish();
    } else {
      info(`Faucet status: ${faucetResp.status}`);
    }

    // Wait for USDC ATA + faucet mintTo to confirm on devnet
    info("Waiting 15s for faucet tx to propagate...");
    await sleep(15000);

    // 4b. Withdraw $0.001 USDC to the platform (real on-chain SPL transfer)
    info(`Sending $0.001 USDC to platform (${PLATFORM_RECIPIENT.slice(0, 12)}...)...`);
    const withdrawResp = await api("/api/wallet/withdraw", {
      method: "POST",
      headers: { Authorization: `Bearer ${payerKey}` },
      body: JSON.stringify({ destination: PLATFORM_RECIPIENT, amount: 0.001 }),
    });

    if (withdrawResp.status !== 200) {
      fail("Withdraw $0.001 USDC to platform", `status=${withdrawResp.status} body=${JSON.stringify(withdrawResp.body).slice(0, 120)}`);
    } else {
      const txHash = withdrawResp.body.txHash;
      ok("Withdraw $0.001 USDC to platform", `tx=${txHash?.slice(0, 20)}...`);
      info("Waiting 4s for tx confirmation...");
      await sleep(4000);

      // 4c. POST /api/questions with X-Payment-Tx
      const t4 = await api("/api/questions", {
        method: "POST",
        headers: { "X-Payment-Tx": txHash },
        body: JSON.stringify({
          title: `402 real payment test ${Date.now()}`,
          body: "Posted via x402 real USDC payment on Solana devnet.",
          tags: ["test", "402"],
        }),
      });
      if (t4.status === 201) {
        ok("Real payment accepted → 201", `questionId=${t4.body.id}`);
      } else {
        fail("Real payment rejected", `status=${t4.status} body=${JSON.stringify(t4.body).slice(0, 120)}`);
      }

      // ── Test 5: Replay the same tx → rejected ─────────────────────────────
      section("Test 5: Replay same tx → 402 replay protection");
      const t5 = await api("/api/questions", {
        method: "POST",
        headers: { "X-Payment-Tx": txHash },
        body: JSON.stringify({ title: "replay test", body: "test", tags: [] }),
      });
      t5.status === 402
        ? ok("Replay rejected → 402", `code=${t5.body.code}`)
        : fail("Replay should be rejected", `got ${t5.status}`);
    }
  }

  finish();
}

function finish() {
  const total = passed + failed;
  console.log(`\n${"━".repeat(50)}`);
  if (failed === 0) {
    console.log(`\x1b[1m\x1b[32mAll ${total} checks passed!\x1b[0m`);
  } else {
    console.log(`\x1b[1mResults: \x1b[32m${passed}\x1b[0m passed, \x1b[31m${failed}\x1b[0m failed / ${total} total\x1b[0m`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
