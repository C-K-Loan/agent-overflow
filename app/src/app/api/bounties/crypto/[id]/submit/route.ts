import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import type { CryptoBounty, UserWallet } from "@/generated/prisma/client";
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
  type VerifierTypeName,
} from "@/lib/solana/verifiers";
import { restoreKeypair } from "@/lib/solana/wallet";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

function humanizeAnchorError(msg: string): string {
  if (msg.includes("Custom:3007") || msg.includes("AccountOwnedByWrongProgram"))
    return "Escrow program mismatch — contact support";
  if (msg.includes("UnsupportedProgramId"))
    return "This verifier type is not yet available on-chain for this network";
  if (msg.includes("VerificationFailed"))
    return "Wrong answer";
  if (msg.includes("BountyAlreadyAwarded"))
    return "Bounty already claimed — someone beat you to it";
  if (msg.includes("BountyExpired"))
    return "Bounty deadline has passed";
  if (msg.includes("InsufficientFunds"))
    return "Insufficient USDC in escrow";
  if (msg.includes("SelfSolve"))
    return "Cannot submit to your own bounty";
  if (msg.includes("InvalidSolution") || msg.includes("ParseError"))
    return `Invalid solution format: ${msg}`;
  return msg;
}

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
  // Prevent self-solving: questioner cannot claim their own bounty
  if (bounty.askerId === user.id) {
    return Response.json({ error: "Cannot submit to your own bounty" }, { status: 403 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found. Create one first." }, { status: 400 });

  // ── zk_rust (type 9): proof-based submission ──────────────────────────────
  // These bounties don't take a text solution — they take a pre-generated ZK proof.
  // The proof + public_values are passed as separate fields.
  if (bounty.verifierType === VERIFIER_TYPES.zk_rust) {
    const body = (jsonResult.data as Record<string, string>);
    const proofB64: string = body.proof;
    const publicValuesB64: string = body.publicValues;
    if (!proofB64 || !publicValuesB64) {
      return Response.json({
        error: "zk_rust bounties require 'proof' and 'publicValues' fields (base64), not 'solution'.",
        hint: "Generate a proof with: aof-zk prove <checker.elf> <your_answer>",
      }, { status: 400 });
    }
    return handleZkRustPayout(bounty, wallet, proofB64, publicValuesB64, id, user.id);
  }

  // ── Step 1: TypeScript pre-verification (fast, free, good UX) ──────────────
  // For types 0-4 this mirrors the Rust on-chain logic exactly.
  // For types 5-8 (type 255 on-chain) this IS the authoritative check.
  try {
    const verifierTypeName = (Object.entries(VERIFIER_TYPES).find(([, v]) => v === bounty.verifierType)?.[0]) as VerifierTypeName;
    const configJson = JSON.parse(bounty.verifierConfig);
    const configBuf = serializeVerifierConfig(verifierTypeName, configJson);
    const tsError = await verifyInTypeScript(bounty.verifierType, configBuf, solution, configJson);
    if (tsError) {
      await prisma.bountyAttempt.create({
        data: { bountyId: id, userId: user.id, solution: solution.slice(0, 100), verified: false, reason: tsError },
      });
      return Response.json({ verified: false, reason: tsError });
    }
  } catch (e: unknown) {
    return Response.json({ error: `Verifier config error: ${(e as Error).message}` }, { status: 500 });
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
  bounty: CryptoBounty,
  wallet: UserWallet,
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
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("BountyNotActive")) {
      return Response.json({ error: "Bounty already awarded — someone beat you to it" }, { status: 409 });
    }
    console.error("On-chain submit failed:", e);
    return Response.json({ error: humanizeAnchorError(msg || "Unknown error") }, { status: 500 });
  }
}

// ── TS-only payout (types 5-8) ───────────────────────────────────────────────
// Verification already passed in Step 1. On-chain the bounty was created with
// verifier_type = 255 (pass-through), so submit_answer skips on-chain verification
// and releases USDC from vault atomically. The solver's custodial key signs the tx.
async function handleTsOnlyPayout(
  bounty: CryptoBounty,
  wallet: UserWallet,
  solution: string,
  bountyId: string,
  userId: string
): Promise<Response> {
  const answererPubkey = new PublicKey(wallet.publicKey);
  const bountyPda      = new PublicKey(bounty.escrowPda);

  try {
    const platformKp     = getPlatformFeeKeypair();
    const answererAta    = await getAssociatedTokenAddress(USDC_MINT, answererPubkey);
    const platformFeeAta = await getOrCreateAssociatedTokenAccount(
      getConnection(), platformKp, USDC_MINT, platformKp.publicKey
    );

    const { ix } = buildSubmitAnswerIx({
      answerer:           answererPubkey,
      answererAta,
      bountyPda,
      platformFeeAccount: platformFeeAta.address,
    });
    // Pass the verified solution; the on-chain verifier (type 255) is a no-op pass-through
    const submitIx = ix(solution);

    // Simulate first — catches double-spend (BountyNotActive) cheaply
    const sim = await simulateTransaction([submitIx], answererPubkey);
    if (!sim.success) {
      const isDoubleSpend =
        sim.error?.includes("BountyNotActive") ||
        sim.logs?.some((l) => l.includes("BountyNotActive"));
      // Custom:12011 = UnknownVerifier — on-chain program doesn't yet support
      // type 255 (TS-only pass-through). Payout will be enabled after program update.
      const isPendingProgramUpdate =
        sim.error?.includes("12011") ||
        sim.logs?.some((l) => l.includes("UnknownVerifier"));
      if (isPendingProgramUpdate) {
        await prisma.bountyAttempt.create({
          data: { bountyId, userId, solution: solution.slice(0, 100), verified: true, reason: "pending_program_update" },
        });
        return Response.json({
          verified: true,
          verifiedBy: "typescript",
          pending: true,
          message: "Answer is correct ✓ — on-chain payout pending a program update (in progress). Your claim is recorded.",
        });
      }
      const reason = isDoubleSpend
        ? "Bounty already awarded — someone beat you to it"
        : humanizeAnchorError(sim.error ?? "Simulation failed");
      await prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: solution.slice(0, 100), verified: false, reason },
      });
      return Response.json(
        { error: reason },
        { status: isDoubleSpend ? 409 : 500 }
      );
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
      verifiedBy: "typescript",
    });
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("BountyNotActive")) {
      return Response.json({ error: "Bounty already awarded — someone beat you to it" }, { status: 409 });
    }
    console.error("TS-only payout failed:", e);
    return Response.json({ error: humanizeAnchorError(msg || "Payout failed") }, { status: 500 });
  }
}

// ── ZK Rust payout (type 9) ──────────────────────────────────────────────────
// Proof is verified ON-CHAIN by the Anchor program's submit_zk_proof instruction.
// No trust in server — the chain verifies the SP1 Groth16 proof atomically with payout.
async function handleZkRustPayout(
  bounty: CryptoBounty,
  wallet: UserWallet,
  proofB64: string,
  publicValuesB64: string,
  bountyId: string,
  userId: string
): Promise<Response> {
  try {
    const proof = Buffer.from(proofB64, "base64");
    const publicValues = Buffer.from(publicValuesB64, "base64");

    if (proof.length < 200 || proof.length > 400) {
      return Response.json({ error: "Invalid proof size (expected ~260 bytes Groth16 proof)" }, { status: 400 });
    }

    const answererPubkey = new PublicKey(wallet.publicKey);
    const bountyPda      = new PublicKey(bounty.escrowPda);
    const platformKp     = getPlatformFeeKeypair();

    const answererAta    = await getAssociatedTokenAddress(USDC_MINT, answererPubkey);
    const platformFeeAta = await getOrCreateAssociatedTokenAccount(
      getConnection(), platformKp, USDC_MINT, platformKp.publicKey
    );

    // Build the submit_zk_proof instruction
    const { buildSubmitZkProofIx } = await import("@/lib/solana");
    const ix = buildSubmitZkProofIx({
      answerer: answererPubkey,
      answererAta,
      bountyPda,
      platformFeeAccount: platformFeeAta.address,
      proof: Array.from(proof),
      publicValues: Array.from(publicValues),
    });

    // submit_zk_proof needs 400K CU (SP1 Groth16 BN254 pairing = ~280K CU)
    const { ComputeBudgetProgram } = await import("@solana/web3.js");
    const budgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

    // Simulate first — if proof is wrong, catch it cheaply
    const sim = await simulateTransaction([budgetIx, ix], answererPubkey);
    if (!sim.success) {
      const isWrong = sim.error?.includes("VerificationFailed") || sim.logs?.some(l => l.includes("VerificationFailed"));
      const reason = isWrong ? "ZK proof verification failed — wrong answer" : `Simulation failed: ${sim.error}`;
      await prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: "zk_proof", verified: false, reason },
      });
      return Response.json({ verified: false, reason });
    }

    // Proof valid — broadcast. Solver's custodial key pays tx fee.
    const solverKeypair = restoreKeypair(wallet.encryptedSecret);
    const txHash = await sendAndConfirm([budgetIx, ix], solverKeypair);

    const { fee, payout } = calculateFee(bounty.amount);

    await prisma.$transaction([
      prisma.cryptoBounty.update({
        where: { id: bountyId },
        data: { status: "awarded", answererId: userId, awardTxHash: txHash, platformFee: fee },
      }),
      prisma.bountyAttempt.create({
        data: { bountyId, userId, solution: "zk_proof", verified: true, txHash },
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
      verifiedBy: "on-chain-zk",
    });
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("BountyNotActive") || msg.includes("SelfSolve")) {
      return Response.json({ error: msg }, { status: 409 });
    }
    console.error("ZK Rust payout failed:", e);
    return Response.json({ error: humanizeAnchorError(msg || "ZK proof submission failed") }, { status: 500 });
  }
}
