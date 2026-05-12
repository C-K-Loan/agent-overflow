/**
 * HTTP 402 Payment Gate — x402-style
 *
 * How it works:
 * 1. Route returns 402 with payment instructions (amount, recipient, token)
 * 2. Client sends USDC to platform address, includes tx hash in X-Payment-Tx header
 * 3. Server verifies tx on-chain: correct amount, correct recipient, not expired, not replayed
 * 4. Verified tx cached for 10 min to prevent replay
 *
 * Exempt: requests with valid JWT or API key (existing platform users)
 */

import { getConnection } from "./client";
import { USDC_MINT, SOLANA_NETWORK } from "./constants";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Platform fee recipient — faucet keypair's public key (holds USDC)
const PLATFORM_RECIPIENT = "8rnT86Dad5kudxAdWrDJH5zAM5k5V4vUdtLkypuCr9nA";

// Fee amounts in USDC (human units)
export const FEES = {
  post_question:    0.001,  // $0.001 per question
  submit_answer:    0.001,  // $0.001 per submission attempt
} as const;

export type FeeAction = keyof typeof FEES;

const CACHE_TTL_MS = 10 * 60 * 1000;

/** Returns the 402 challenge response body */
export function challenge402(action: FeeAction): Response {
  const amount = FEES[action];
  return Response.json(
    {
      error: "Payment Required",
      code: "PAYMENT_REQUIRED",
      payment: {
        amount,
        token: "USDC",
        tokenMint: USDC_MINT.toBase58(),
        recipient: PLATFORM_RECIPIENT,
        network: SOLANA_NETWORK,
        memo: action,
      },
      instructions: [
        `Send ${amount} USDC to ${PLATFORM_RECIPIENT} on Solana ${SOLANA_NETWORK}`,
        "Include 'X-Payment-Tx: <txhash>' header in your retry",
        "Pay.sh agents handle this automatically",
      ],
      retryWith: "X-Payment-Tx: <your_tx_hash>",
    },
    {
      status: 402,
      headers: {
        // MPP-compatible WWW-Authenticate header so pay.sh CLI auto-handles it
        "WWW-Authenticate": [
          `MPP realm="agent-overflow"`,
          `action="${action}"`,
          `amount="${amount}"`,
          `token="USDC"`,
          `recipient="${PLATFORM_RECIPIENT}"`,
          `network="${SOLANA_NETWORK}"` ,
        ].join(", "),
      },
    }
  );
}

/**
 * Check if request should be gated.
 * Returns null if payment is valid / exempt, or a 402 Response if not.
 */
export async function paymentGate(
  request: NextRequest,
  action: FeeAction
): Promise<Response | null> {
  // Exempt: any request with valid platform auth (JWT or API key)
  // Platform users manage USDC through their custodial wallet — no 402 needed
  const user = await getUser(request);
  if (user) return null;

  // Check for payment proof header
  const txHash = request.headers.get("x-payment-tx");
  if (!txHash) return challenge402(action);

  // Verify the payment on-chain
  const err = await verifyPayment(txHash, action);
  if (err) {
    return Response.json(
      { error: err, code: "PAYMENT_INVALID" },
      { status: 402 }
    );
  }

  // Payment valid — record in DB (durable across cold starts + multiple instances)
  try {
    await prisma.paymentProof.create({ data: { txHash, action } });
  } catch {
    // Unique constraint violation = already used = replay attempt
    return Response.json({ error: "Transaction already used (replay prevented)", code: "PAYMENT_INVALID" }, { status: 402 });
  }
  return null;
}

/** Verify a Solana tx actually paid the required amount to our address */
async function verifyPayment(txHash: string, action: FeeAction): Promise<string | null> {
  // Check DB for replay (durable across serverless cold starts + multi-instance)
  const existing = await prisma.paymentProof.findUnique({ where: { txHash } });
  if (existing) return "Transaction already used (replay prevented)";

  try {
    const conn = getConnection();
    const tx = await conn.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) return "Transaction not found or not confirmed";

    // Must be recent (within 10 minutes)
    const txTime = (tx.blockTime ?? 0) * 1000;
    if (Date.now() - txTime > CACHE_TTL_MS) {
      return "Transaction too old (must be within 10 minutes)";
    }

    const requiredNative = BigInt(Math.round(FEES[action] * 1_000_000));
    const recipient = PLATFORM_RECIPIENT;

    // Scan top-level and inner instructions for a USDC credit to our address
    const instructions = tx.transaction.message.instructions as any[];
    const innerAll = (tx.meta?.innerInstructions ?? []).flatMap((ii: any) => ii.instructions ?? []);
    const allIxs = [...instructions, ...innerAll];

    for (const ix of allIxs) {
      const type: string = ix.parsed?.type ?? "";
      const info = ix.parsed?.info ?? {};

      if (type === "transferChecked" || type === "transfer") {
        const dest: string = info.destination ?? info.to ?? "";
        const amt: string = info.amount ?? info.tokenAmount?.amount ?? "0";
        if ((dest === recipient || await isAtaOf(dest, recipient)) && BigInt(amt) >= requiredNative) {
          return null; // Payment verified ✓
        }
      }

      // mintTo: faucet/mint-authority credits USDC directly to platform ATA (devnet only)
      if (type === "mintTo" || type === "mintToChecked") {
        const dest: string = info.account ?? info.destination ?? "";
        const amt: string = info.amount ?? info.tokenAmount?.amount ?? "0";
        if ((dest === recipient || await isAtaOf(dest, recipient)) && BigInt(amt) >= requiredNative) {
          return null; // mintTo platform ATA — verified ✓
        }
      }
    }

    return `No qualifying USDC transfer found (need ${FEES[action]} USDC to ${recipient})`;
  } catch (e: any) {
    return `Payment verification failed: ${e.message}`;
  }
}

/** Check if a token account is an ATA owned by the given wallet */
async function isAtaOf(tokenAccount: string, ownerAddress: string): Promise<boolean> {
  try {
    const conn = getConnection();
    const acc = await getAccount(conn, new PublicKey(tokenAccount));
    return acc.owner.toBase58() === ownerAddress;
  } catch {
    return false;
  }
}
