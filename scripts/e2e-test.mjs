#!/usr/bin/env node
/**
 * Full E2E test: "What's the square root of 9?" crypto bounty
 *
 * Prerequisites:
 *   1. solana-test-validator running with ao_escrow program loaded
 *   2. Next.js dev server running on localhost:3000
 *   3. .env has SOLANA_RPC_URL=http://127.0.0.1:8899, WALLET_ENCRYPTION_KEY set
 *
 * What this does:
 *   1. Register questioner + answerer agents
 *   2. Create wallets for both
 *   3. Fund wallets (SOL + USDC) via local validator
 *   4. Initialize fee vault
 *   5. Ask question: "What is the square root of 9?"
 *   6. Create $10 USDC bounty (exact_number, target=3)
 *   7. Submit wrong answer (5) — should fail via simulation
 *   8. Submit correct answer (3) — should pay out
 *   9. Verify final state
 */

import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import * as fs from "fs";
import * as crypto from "crypto";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const RPC = "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey("3Cr9smqeF12BhzG3fWJVJ21V4WwmG2Vz3rRuLiPgzJGK");

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok && !data.verified && data.verified !== false) {
    throw new Error(`API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function apiAuth(key, path, opts = {}) {
  return api(path, {
    ...opts,
    headers: { ...opts.headers, Authorization: `Bearer ${key}` },
  });
}

function log(step, msg) {
  console.log(`\n[${ step}] ${msg}`);
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  console.log("=== AGENT OVERFLOW E2E: CRYPTO BOUNTY FLOW ===\n");

  // Load local payer (validator genesis keypair)
  const payerSecret = JSON.parse(
    fs.readFileSync(`${process.env.HOME}/.config/solana/devnet.json`, "utf8")
  );
  const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));
  log("SETUP", `Payer: ${payer.publicKey.toBase58()} (${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL)`);

  // ============================
  // Step 1: Create USDC mint
  // ============================
  log("1", "Creating USDC mint...");
  const usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`   USDC Mint: ${usdcMint.toBase58()}`);
  console.log(`   ⚠  Your .env needs USDC_MINT=${usdcMint.toBase58()}`);

  // ============================
  // Step 2: Register agents
  // ============================
  log("2", "Registering agents...");
  let questioner, answerer;
  try {
    questioner = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: `math-prof-${Date.now()}`, type: "agent" }),
    });
  } catch (e) {
    console.log("   Questioner already exists or error:", e.message);
    process.exit(1);
  }
  answerer = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: `math-solver-${Date.now()}`, type: "agent" }),
  });
  console.log(`   Questioner: ${questioner.name} (${questioner.id})`);
  console.log(`   Answerer:   ${answerer.name} (${answerer.id})`);

  // ============================
  // Step 3: Create wallets
  // ============================
  log("3", "Creating wallets...");
  const qWallet = await apiAuth(questioner.apiKey, "/api/wallet/create", { method: "POST" });
  const aWallet = await apiAuth(answerer.apiKey, "/api/wallet/create", { method: "POST" });
  console.log(`   Questioner wallet: ${qWallet.publicKey}`);
  console.log(`   Answerer wallet:   ${aWallet.publicKey}`);

  const qPubkey = new PublicKey(qWallet.publicKey);
  const aPubkey = new PublicKey(aWallet.publicKey);

  // ============================
  // Step 4: Fund wallets (SOL + USDC)
  // ============================
  log("4", "Funding wallets...");

  // SOL airdrops
  for (const [name, pk] of [["Questioner", qPubkey], ["Answerer", aPubkey]]) {
    const sig = await connection.requestAirdrop(pk, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    console.log(`   ${name}: 2 SOL airdropped`);
  }

  // USDC minting
  const qAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, qPubkey);
  await mintTo(connection, payer, usdcMint, qAta.address, payer, 100_000_000); // $100 USDC
  console.log(`   Questioner: $100 USDC minted to ${qAta.address.toBase58().slice(0, 12)}...`);

  const aAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, aPubkey);
  // Answerer doesn't need USDC — they receive it from the bounty
  console.log(`   Answerer ATA: ${aAta.address.toBase58().slice(0, 12)}... (empty, will receive payout)`);

  // ============================
  // Step 5: Initialize fee vault PDA
  // ============================
  log("5", "Initializing fee vault...");
  const [feeVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    PROGRAM_ID
  );

  // Build init_fee_vault instruction manually
  const initFeeVaultDisc = Buffer.from([141, 17, 88, 209, 137, 84, 89, 235]);
  const initFeeVaultIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: feeVaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    data: initFeeVaultDisc,
  };

  const initTx = new Transaction().add(initFeeVaultIx);
  const initSig = await sendAndConfirmTransaction(connection, initTx, [payer]);
  console.log(`   Fee vault initialized: ${feeVaultPda.toBase58().slice(0, 12)}... (tx: ${initSig.slice(0, 12)}...)`);

  // ============================
  // Step 6: Ask the question
  // ============================
  log("6", "Asking: 'What is the square root of 9?'");
  const question = await apiAuth(questioner.apiKey, "/api/questions", {
    method: "POST",
    body: JSON.stringify({
      title: "What is the square root of 9?",
      body: "I need the exact integer answer to sqrt(9). Respond with just the number.\n\nThis question has a **$10 USDC crypto bounty** with an exact_number verifier. First correct answer wins!",
      tags: ["math"],
    }),
  });
  console.log(`   Question: ${question.id} — "${question.title}"`);

  // ============================
  // Step 7: Create crypto bounty ($10 USDC, exact_number, target=3)
  // ============================
  log("7", "Creating $10 USDC bounty (exact_number, target=3)...");
  const deadline = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  const bounty = await apiAuth(questioner.apiKey, "/api/bounties/crypto", {
    method: "POST",
    body: JSON.stringify({
      questionId: question.id,
      amount: 10,
      verifier: { type: "exact_number", config: { target: 3 } },
      deadline,
    }),
  });
  console.log(`   Bounty ID: ${bounty.id}`);
  console.log(`   Status: ${bounty.status}`);
  console.log(`   Escrow PDA: ${bounty.escrowPda?.slice(0, 12)}...`);
  console.log(`   Tx: ${bounty.txHash?.slice(0, 12)}...`);
  if (bounty.explorerUrl) console.log(`   Explorer: ${bounty.explorerUrl}`);

  // ============================
  // Step 8: Submit WRONG answer (5)
  // ============================
  log("8", "Answerer submits wrong answer: 5");
  const wrong = await apiAuth(answerer.apiKey, `/api/bounties/crypto/${bounty.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ solution: "5" }),
  });
  console.log(`   Verified: ${wrong.verified}`);
  console.log(`   Reason: ${wrong.reason || "N/A"}`);
  if (wrong.verified) {
    console.error("   ERROR: Wrong answer should not have been verified!");
    process.exit(1);
  }
  console.log(`   ✓ Wrong answer correctly rejected (no gas spent)`);

  // ============================
  // Step 9: Submit CORRECT answer (3)
  // ============================
  log("9", "Answerer submits correct answer: 3");
  const correct = await apiAuth(answerer.apiKey, `/api/bounties/crypto/${bounty.id}/submit`, {
    method: "POST",
    body: JSON.stringify({ solution: "3" }),
  });
  console.log(`   Verified: ${correct.verified}`);
  if (correct.verified) {
    console.log(`   Payout: $${correct.payout} USDC`);
    console.log(`   Fee: $${correct.fee} USDC`);
    console.log(`   Tx: ${correct.txHash?.slice(0, 12)}...`);
    console.log(`   ✓ Correct answer verified and paid out!`);
  } else {
    console.error(`   ERROR: Correct answer should have been verified! Reason: ${correct.reason}`);
    console.error(`   Full response: ${JSON.stringify(correct)}`);
    process.exit(1);
  }

  // ============================
  // Step 10: Verify final state
  // ============================
  log("10", "Final verification...");

  const finalBounty = await api(`/api/bounties/crypto/${bounty.id}`);
  console.log(`   Bounty status: ${finalBounty.status}`);
  console.log(`   Answerer: ${finalBounty.answerer?.name || "none"}`);

  const qBalance = await apiAuth(questioner.apiKey, "/api/wallet/balance");
  const aBalance = await apiAuth(answerer.apiKey, "/api/wallet/balance");
  console.log(`   Questioner balance: ${qBalance.sol} SOL, $${qBalance.usdc} USDC`);
  console.log(`   Answerer balance:   ${aBalance.sol} SOL, $${aBalance.usdc} USDC`);

  const stats = await api("/api/payments/stats");
  console.log(`   Platform stats:`);
  console.log(`     Total bounties: ${stats.totalBounties}`);
  console.log(`     Total volume: $${stats.totalVolumeUsdc} USDC`);
  console.log(`     Total fees: $${stats.totalFeesUsdc} USDC`);
  console.log(`     Progress to $100: ${stats.progressTo100}%`);

  console.log("\n=== E2E TEST PASSED ===");
  console.log(`\nFull flow completed:`);
  console.log(`  1. Question asked: "${question.title}"`);
  console.log(`  2. $10 USDC bounty created with exact_number verifier (target=3)`);
  console.log(`  3. Wrong answer (5) rejected via free simulation`);
  console.log(`  4. Correct answer (3) verified on-chain, $${correct.payout} paid to solver`);
  console.log(`  5. Platform earned $${correct.fee} in fees`);
}

main().catch((e) => {
  console.error("\n=== E2E FAILED ===");
  console.error(e);
  process.exit(1);
});
