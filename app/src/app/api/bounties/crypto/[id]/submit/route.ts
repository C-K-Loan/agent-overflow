import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { safeJson } from "@/lib/schemas";
import { paymentGate } from "@/lib/solana/payment-gate";
import { fireWebhooks } from "@/lib/webhooks";
import {
  buildSubmitAnswerIx,
  explorerUrl,
  USDC_MINT,
} from "@/lib/solana";
import { getConnection } from "@/lib/solana/client";
import { simulateTransaction, sendAndConfirm } from "@/lib/solana/simulate";
import { calculateFee } from "@/lib/solana/fees";
import {
  nativeToUsdc,
  TS_ONLY_VERIFIERS,
  verifyInTypeScript,
  serializeVerifierConfig,
  VERIFIER_TYPES,
} from "@/lib/solana/verifiers";
import { restoreKeypair } from "@/lib/solana/wallet";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

// Platform fee wallet — receives 1% from every bounty.
// Derived from FAUCET_KEYPAIR (same keypair acts as mint authority + fee recipient).
function getPlatformFeeKeypair(): Keypair {
  const raw = process.env.FAUCET_KEYPAIR;
  if (!raw) throw new Error("FAUCET_KEYPAIR env var not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 402 payment gate: exempt if authenticated (platform user), else require $0.001 USDC
  const gate = await paymentGate(request, "submit_answer");
  if (gate) return gate;

  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const jsonResult = await safeJson(request);
  if (!jsonResult.ok) return jsonResult.response;
  const { solution } = jsonResult.data as { solution?: string };

  if (!solution || typeof solution !== "string") {
    return Response.json({ error: "solution field required (string)" }, { status: 400 });
  }
  if (solution.length > 1024) {
    return Response.json({ error: "Solution too long (max 1024 characters)" }, { status: 400 });
  }

  const bounty = await prisma.cryptoBounty.findUnique({ where: { id } });
  if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });
  if (bounty.status !== "funded") return Response.json({ error: "Bounty is not active" }, { status: 409 });
  if (bounty.commitReveal) {
    return Response.json(
      { error: "This bounty requires commit-reveal. Use /commit and /reveal endpoints." },
      { status: 412 }
    );
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found. Create one first." }, { status: 400 });

  // ── Step 1: TypeScript pre-verification (fast, free, good UX) ──────────────
  // For types 0-4 this mirrors the Rust on-chain logic exactly.
  // For types 5-8 (type 255 on-chain) this IS the authoritative check.
  try {
    const verifierTypeName = (Object.entries(VERIFIER_TYPES).find(([, v]) => v === bounty.verifierType)?.[0]) as any;
    const configJson = JSON.parse(bounty.verifierConfig);
    const configBuf = serializeVerifierConfig(verifierTypeName, configJson);
    const tsError = await verifyInTypeScript(bounty.verifierType, configBuf, solution, configJson);
    if (tsError) {
      await prisma.bountyAttempt.create({
        data: { bountyId: id, userId: user.id, solution: solution.slice(0, 100), verified: false, reason: tsError },
      });
      return Response.json({ verified: false, reason: tsError });
    }
  } catch (e: any) {
    return Response.json({ error: `Verifier config error: ${e.message}` }, { status: 500 });
  }

  // ── Step 2: Route by verifier type ────────────────────────────────────────
  // Types 0-4: on-chain verification (Rust program) + on-chain escrow release.
  // Types 5-8: TS-verified above; on-chain pass-through (type 255) + faucet payout.
  if (TS_ONLY_VERIFIERS.has(bounty.verifierType)) {
    return handleTsOnlyPayout(bounty, wallet, solution, id, user.id);
  }

  return handleOnChainPayout(bounty, wallet, solution, id, user.id);
}

// ── On-chain payout (types 0-4) ─────────────────────────────────────────────
// Rust program verifies on-chain + transfers USDC from vault atomically.
// Fully trustless: no backend involvement in the verification or payment.
async function handleOnChainPayout(
  bounty: any,
  wallet: any,
  solution: string,
  bountyId: string,
  userId: string
): Promise<Response> {
  const answererPubkey = new PublicKey(wallet.publicKey);
  const bountyPda      = new PublicKey(bounty.escrowPda);

  // Build on-chain solution string (convert floats to fixed-point for numeric types)
  let onChainSolution = solution;
  const SCALE = 1_000_000;
  if (bounty.verifierType === 2 || bounty.verifierType === 3) {
    const num = parseFloat(solution);
    if (!isNaN(num)) onChainSolution = String(Math.round(num * SCALE));
  } else if (bounty.verifierType === 4) {
    onChainSolution = solution.split(",").map((pair: string) => {
      const [key, val] = pair.split("=");
      const num = parseFloat(val);
      return !isNaN(num) ? `${key}=${Math.round(num * SCALE)}` : pair;
    }).join(",");
  }

  try {
    const platformKp      = getPlatformFeeKeypair();
    const answererAta     = await getAssociatedTokenAddress(USDC_MINT, answererPubkey);
    const platformFeeAta  = await getOrCreateAssociatedTokenAccount(
      getConnection(), platformKp, USDC_MINT, platformKp.publicKey
    );

    const { ix } = buildSubmitAnswerIx({
      answerer:           answererPubkey,
      answererAta,
      bountyPda,
      platformFeeAccount: platformFeeAta.address,
    });
    const submitIx = ix(onChainSolution);

    // Simulate first — if Rust rejects the answer, we catch it free
    const sim = await simulateTransaction([submitIx], answererPubkey);
    if (!sim.success) {
      const isWrong =
        sim.error?.includes("VerificationFailed") ||
        sim.logs?.some((l) => l.includes("VerificationFailed"));
      const reason = isWrong ? "Wrong answer" : `Simulation failed: ${sim.error}`;
      await prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: solution.slice(0, 100), verified: false, reason },
      });
      return Response.json({ verified: false, reason });
    }

    // Simulation passed — broadcast. Solver's custodial key signs.
    const solverKeypair = restoreKeypair(wallet.encryptedSecret);
    const txHash = await sendAndConfirm([submitIx], solverKeypair);

    const { fee, payout } = calculateFee(bounty.amount);
    await prisma.$transaction([
      prisma.cryptoBounty.update({
        where: { id: bountyId },
        data: { status: "awarded", answererId: userId, awardTxHash: txHash, platformFee: fee },
      }),
      prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: solution.slice(0, 100), verified: true, txHash },
      }),
      prisma.paymentLog.create({
        data: {
          type: "bounty_awarded", amount: payout, token: "USDC",
          fromWallet: bounty.vaultPda, toWallet: wallet.publicKey, txHash, bountyId, userId,
        },
      }),
    ]);

    fireWebhooks(bounty.askerId, "bounty.crypto.awarded", {
      bountyId, answererId: userId, payout: nativeToUsdc(payout), fee: nativeToUsdc(fee), txHash,
    });

    return Response.json({
      verified: true, txHash,
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      explorerUrl: explorerUrl(txHash),
      verifiedBy: "on-chain",
    });
  } catch (e: any) {
    if (e.message?.includes("BountyNotActive")) {
      return Response.json({ error: "Bounty already awarded — someone beat you to it" }, { status: 409 });
    }
    console.error("On-chain submit failed:", e);
    return Response.json({ error: `Transaction failed: ${e.message}` }, { status: 500 });
  }
}

// ── TS-only payout (types 5-8) ───────────────────────────────────────────────
// Verification already passed in Step 1. On-chain the bounty uses type 255
// (pass-through). Faucet mints payout USDC directly to solver.
// TODO: once Rust program supports types 5-8 natively, route through on-chain.
async function handleTsOnlyPayout(
  bounty: any,
  wallet: any,
  solution: string,
  bountyId: string,
  userId: string
): Promise<Response> {
  try {
    const platformKp    = getPlatformFeeKeypair();
    const conn          = getConnection();
    const answererPubkey = new PublicKey(wallet.publicKey);
    const { fee, payout } = calculateFee(bounty.amount);

    const ata    = await getOrCreateAssociatedTokenAccount(conn, platformKp, USDC_MINT, answererPubkey);
    const txHash = await mintTo(conn, platformKp, USDC_MINT, ata.address, platformKp, payout);

    await prisma.$transaction([
      prisma.cryptoBounty.update({
        where: { id: bountyId },
        data: { status: "awarded", answererId: userId, awardTxHash: String(txHash), platformFee: fee },
      }),
      prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: solution.slice(0, 100), verified: true, txHash: String(txHash) },
      }),
      prisma.paymentLog.create({
        data: {
          type: "bounty_awarded", amount: payout, token: "USDC",
          fromWallet: platformKp.publicKey.toBase58(), toWallet: wallet.publicKey,
          txHash: String(txHash), bountyId, userId,
        },
      }),
    ]);

    fireWebhooks(bounty.askerId, "bounty.crypto.awarded", {
      bountyId, answererId: userId, payout: nativeToUsdc(payout), fee: nativeToUsdc(fee), txHash: String(txHash),
    });

    return Response.json({
      verified: true,
      txHash: String(txHash),
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      explorerUrl: explorerUrl(String(txHash)),
      verifiedBy: "typescript",
    });
  } catch (e: any) {
    console.error("TS-only payout failed:", e);
    return Response.json({ error: `Payout failed: ${e.message}` }, { status: 500 });
  }
}
