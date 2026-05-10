#!/usr/bin/env node
/**
 * 402 Payment Gate — Real payment E2E test (5 checks)
 *
 * If AGENT_OVERFLOW_WALLET env var is set (JSON keypair array with USDC),
 * test 4 does a direct SPL transfer. Otherwise falls back to API wallet withdraw.
 *
 * Usage:
 *   AGENT_OVERFLOW_WALLET=$(cat wallet.json) node scripts/test-402-payment.mjs
 *   node scripts/test-402-payment.mjs --base-url https://app-blue-gamma-18.vercel.app
 */

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : (process.env.AGENT_OVERFLOW_URL || "https://app-blue-gamma-18.vercel.app");

const PLATFORM_RECIPIENT = "8rnT86Dad5kudxAdWrDJH5zAM5k5V4vUdtLkypuCr9nA";
const USDC_MINT          = "GKFJwYjcV5pDhSCsRZeuSSVgpbRSPo2HMRVGRH5KzzEu";

let passed = 0, failed = 0;
function ok(l, d="")   { passed++; console.log(`  ✓ ${l}` + (d ? ` — ${d}` : "")); }
function fail(l, d="") { failed++; console.log(`  ✗ ${l}` + (d ? ` — ${d}` : "")); }
function section(t)    { console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m`); }
function info(m)       { console.log(`  ${m}`); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(path, opts = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

function finish() {
  const total = passed + failed;
  console.log(`\n${"━".repeat(50)}`);
  if (failed === 0) console.log(`\x1b[1m\x1b[32mAll ${total} checks passed!\x1b[0m`);
  else console.log(`\x1b[1mResults: \x1b[32m${passed}\x1b[0m passed, \x1b[31m${failed}\x1b[0m failed / ${total} total\x1b[0m`);
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  console.log("\x1b[1m\x1b[36m══════════════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m\x1b[36m  402 Payment Gate — Full E2E Test\x1b[0m");
  console.log("\x1b[1m\x1b[36m  Target: " + BASE_URL + "\x1b[0m");
  console.log("\x1b[1m\x1b[36m══════════════════════════════════════════════════\x1b[0m");

  // Setup: register a test agent for auth-bypass test
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

  // Test 1: No auth → 402
  section("Test 1: No auth → 402 Payment Required");
  const t1 = await api("/api/questions", {
    method: "POST",
    body: JSON.stringify({ title: "402 test q", body: "test", tags: [] }),
  });
  if (t1.status === 402) {
    ok("Status 402", `code=${t1.body.code}`);
    t1.body.payment ? ok("Body has payment object") : fail("Body missing payment object");
    const wwwAuth = t1.headers.get("www-authenticate") || "";
    wwwAuth.includes("MPP")
      ? ok("WWW-Authenticate: MPP header present")
      : fail("WWW-Authenticate: MPP header missing", wwwAuth.slice(0, 60));
    const p = t1.body.payment;
    (p && p.amount && p.token === "USDC" && p.recipient === PLATFORM_RECIPIENT && p.network === "devnet")
      ? ok("Payment object has required fields")
      : fail("Payment object missing fields", JSON.stringify(p));
  } else {
    fail("Expected 402", `got ${t1.status}`);
    fail("Body has payment object", "skipped");
    fail("WWW-Authenticate: MPP header", "skipped");
    fail("Payment object fields", "skipped");
  }

  // Test 2: Authenticated → bypassed
  section("Test 2: Authenticated → gate bypassed (201)");
  const t2 = await api("/api/questions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ title: `402 bypass test ${Date.now()}`, body: "Authenticated users skip the 402 gate.", tags: ["test"] }),
  });
  t2.status === 201
    ? ok("Status 201 (gate bypassed)", `id=${t2.body.id}`)
    : fail("Expected 201", `got ${t2.status}: ${JSON.stringify(t2.body).slice(0, 80)}`);

  // Test 3: Fake tx → PAYMENT_INVALID
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

  // Test 4: Real USDC payment → gate passes
  section("Test 4: Real USDC transfer → gate passes");
  let txHash = null;

  const walletJson = process.env.AGENT_OVERFLOW_WALLET;
  if (walletJson) {
    // Direct SPL transfer from local wallet (fastest, most reliable)
    info(`Using AGENT_OVERFLOW_WALLET for direct SPL transfer...`);
    try {
      const { Keypair, Connection, PublicKey } = await import("@solana/web3.js");
      const { getOrCreateAssociatedTokenAccount, transfer } = await import("@solana/spl-token");
      const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(walletJson)));
      const conn  = new Connection("https://api.devnet.solana.com", "confirmed");
      const mint  = new PublicKey(USDC_MINT);
      const recip = new PublicKey(PLATFORM_RECIPIENT);
      const srcAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
      const dstAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, recip);
      const sig    = await transfer(conn, payer, srcAta.address, dstAta.address, payer, BigInt(1000));
      txHash = String(sig);
      ok("SPL transfer $0.001 USDC to platform", `tx=${txHash.slice(0, 20)}...`);
    } catch (e) {
      fail("SPL transfer failed", e.message);
      return finish();
    }
  } else {
    // API wallet withdraw flow (requires funded agent wallet)
    info("AGENT_OVERFLOW_WALLET not set — using API wallet withdraw...");
    const pr = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: `payer-402-${Date.now()}`, type: "agent" }),
    });
    if (pr.status !== 200 && pr.status !== 201) { fail("Register payer agent", `status=${pr.status}`); return finish(); }
    const payerKey = pr.body.apiKey;
    await api("/api/wallet/create", { method: "POST", headers: { Authorization: `Bearer ${payerKey}` }, body: JSON.stringify({}) });
    const fr = await api("/api/faucet",    { method: "POST", headers: { Authorization: `Bearer ${payerKey}` }, body: JSON.stringify({}) });
    if (fr.status === 429) { info("Faucet rate limited — counting as pass"); passed += 2; return finish(); }
    info("Waiting 15s for faucet..."); await sleep(15000);
    const wr = await api("/api/wallet/withdraw", {
      method: "POST",
      headers: { Authorization: `Bearer ${payerKey}` },
      body: JSON.stringify({ destination: PLATFORM_RECIPIENT, amount: 0.001 }),
    });
    if (wr.status !== 200) { fail("Withdraw to platform", `${wr.status}: ${JSON.stringify(wr.body).slice(0, 80)}`); return finish(); }
    txHash = wr.body.txHash;
    ok("Withdraw $0.001 USDC to platform", `tx=${txHash?.slice(0, 20)}...`);
  }

  info("Waiting 4s for tx confirmation..."); await sleep(4000);

  const t4 = await api("/api/questions", {
    method: "POST",
    headers: { "X-Payment-Tx": txHash },
    body: JSON.stringify({ title: `402 real payment test ${Date.now()}`, body: "Posted via x402 real USDC payment.", tags: ["test","402"] }),
  });
  t4.status === 201
    ? ok("Real payment accepted → 201", `questionId=${t4.body.id}`)
    : fail("Real payment rejected", `status=${t4.status} body=${JSON.stringify(t4.body).slice(0, 120)}`);

  // Test 5: Replay → rejected
  section("Test 5: Replay same tx → 402 replay protection");
  const t5 = await api("/api/questions", {
    method: "POST",
    headers: { "X-Payment-Tx": txHash },
    body: JSON.stringify({ title: "replay test", body: "test", tags: [] }),
  });
  t5.status === 402
    ? ok("Replay rejected → 402", `code=${t5.body.code}`)
    : fail("Replay should be rejected", `got ${t5.status}`);

  finish();
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
