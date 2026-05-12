/**
 * Jito bundle integration for atomic bounty creation.
 *
 * Agent Overflow uses Jito bundles to submit [create_bounty + fund_bounty]
 * as a single atomic bundle. This prevents MEV front-running between the
 * two instructions — a malicious actor cannot drain the newly-created vault
 * PDA between the create and fund steps.
 *
 * Falls back to standard sendAndConfirm if Jito bundle submission fails.
 */

import {
  Connection,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getConnection } from "./client";

const JITO_BLOCK_ENGINE_URL =
  process.env.JITO_BLOCK_ENGINE_URL ?? "https://mainnet.block-engine.jito.wtf";

const JITO_TIP_LAMPORTS = parseInt(
  process.env.JITO_TIP_LAMPORTS ?? "10000" // 0.00001 SOL default tip
);

// Jito tip accounts (rotated randomly for load balancing)
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1sMXoi62cCo",
].map((a) => new PublicKey(a));

function randomTipAccount(): PublicKey {
  return JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
}

/**
 * Send instructions as a Jito bundle for atomic execution + MEV protection.
 * Returns the bundle UUID if submitted, or null on failure (caller should fall back).
 */
export async function sendJitoBundle(
  instructions: TransactionInstruction[],
  payer: Keypair
): Promise<string | null> {
  try {
    const conn = getConnection();
    const { blockhash } = await conn.getLatestBlockhash("confirmed");

    // Add Jito tip instruction (SOL transfer to a tip account)
    const { SystemProgram } = await import("@solana/web3.js");
    const tipIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: randomTipAccount(),
      lamports: JITO_TIP_LAMPORTS,
    });

    const allIxs = [...instructions, tipIx];

    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: allIxs,
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);

    const serialized = Buffer.from(tx.serialize()).toString("base64");

    const response = await fetch(
      `${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [[serialized]],
        }),
      }
    );

    if (!response.ok) return null;
    const data = await response.json() as { result?: string; error?: unknown };
    return data.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Confirm a Jito bundle by polling its status.
 */
export async function confirmJitoBundle(
  bundleId: string,
  timeoutMs = 30_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${JITO_BLOCK_ENGINE_URL}/api/v1/bundles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getInflightBundleStatuses",
            params: [[bundleId]],
          }),
        }
      );
      if (!response.ok) break;
      const data = await response.json() as { result?: { value?: Array<{ status: string }> } };
      const status = data.result?.value?.[0]?.status;
      if (status === "Landed") return true;
      if (status === "Failed") return false;
    } catch {
      // continue polling
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** Estimate SOL tip in USD for display */
export function jitoTipUsd(solPriceUsd = 150): number {
  return (JITO_TIP_LAMPORTS / LAMPORTS_PER_SOL) * solPriceUsd;
}
