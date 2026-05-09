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
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";

// Platform fee recipient — faucet keypair's public key (holds USDC)
const PLATFORM_RECIPIENT = "8rnT86Dad5kudxAdWrDJH5zAM5k5V4vUdtLkypuCr9nA";

// Fee amounts in USDC (human units)
export const FEES = {
  post_question:    0.001,  // $0.001 per question
  submit_answer:    0.001,  // $0.001 per submission attempt
} as const;

export type FeeAction = keyof typeof FEES;

// In-memory cache of verified tx hashes (prevents replay within 10 min)
const verifiedTxCache = new Map<string, number>();
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
        tokenMint: "GKFJwYjcV5pDhSCsRZeuSSVgpbRSPo2HMRVGRH5KzzEu",
        recipient: PLATFORM_RECIPIENT,
        network: "devnet",
        memo: action,
      },
      instructions: [
        `Send ${amount} USDC to ${PLATFORM_RECIPIENT} on Solana devnet`,
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
          `network="devnet"`,
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

  // Payment valid — cache it and allow the request through
  verifiedTxCache.set(txHash, Date.now());
  return null;
}

/** Verify a Solana tx actually paid the required amount to our address */
async function verifyPayment(txHash: string, action: FeeAction): Promise<string | null> {
  // Check replay cache
  const cached = verifiedTxCache.get(txHash);
  if (cached) {
    if (Date.now() - cached < CACHE_TTL_MS) {
      return "Transaction already used (replay prevented)";
    }
    verifiedTxCache.delete(txHash);
  }

  // Prune stale cache entries
  const now = Date.now();
  for (const [k, t] of verifiedTxCache) {
    if (now - t > CACHE_TTL_MS) verifiedTxCache.delete(k);
  }

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

    // Scan instructions for a token transfer to our address
    const instructions = tx.transaction.message.instructions as any[];
    for (const ix of instructions) {
      if (ix.parsed?.type === "transferChecked" || ix.parsed?.type === "transfer") {
        const info = ix.parsed.info;
        const dest: string = info.destination ?? info.to ?? "";
        const amt: string = info.amount ?? info.tokenAmount?.amount ?? "0";

        // Check destination is our platform address or an ATA of our address
        if (dest === recipient || await isAtaOf(dest, recipient)) {
          if (BigInt(amt) >= requiredNative) {
            return null; // Payment verified ✓
          }
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
