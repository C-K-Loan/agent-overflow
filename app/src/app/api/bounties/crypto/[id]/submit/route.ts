import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { safeJson } from "@/lib/schemas";
import { fireWebhooks } from "@/lib/webhooks";
import {
  buildSubmitAnswerIx,
  findVaultPda,
  explorerUrl,
  USDC_MINT,
} from "@/lib/solana";
import { simulateTransaction, sendAndConfirm } from "@/lib/solana/simulate";
import { calculateFee } from "@/lib/solana/fees";
import { nativeToUsdc, TS_ONLY_VERIFIERS, verifyInTypeScript, serializeVerifierConfig, VERIFIER_TYPES } from "@/lib/solana/verifiers";
import { restoreKeypair } from "@/lib/solana/wallet";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Get bounty
  const bounty = await prisma.cryptoBounty.findUnique({ where: { id } });
  if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });

  if (bounty.status !== "funded") {
    return Response.json({ error: "Bounty is not active" }, { status: 409 });
  }

  if (bounty.commitReveal) {
    return Response.json(
      { error: "This bounty requires commit-reveal. Use /commit and /reveal endpoints." },
      { status: 412 }
    );
  }

  // Get answerer wallet
  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    return Response.json({ error: "No wallet found. Create one first." }, { status: 400 });
  }

  const answererPubkey = new PublicKey(wallet.publicKey);
  const bountyPda = new PublicKey(bounty.escrowPda);
  const answererAta = await getAssociatedTokenAddress(USDC_MINT, answererPubkey);

  // Convert solution to on-chain format based on verifier type
  // Types 2 (numeric_tolerance), 3 (numeric_range): answer is a float, convert to fixed-point
  // Type 4 (multi_numeric_tolerance): "key1=val1,key2=val2" — convert values to fixed-point
  // Types 0 (exact_string), 1 (exact_number): pass through as-is
  let onChainSolution = solution;
  const SCALE = 1_000_000;
  if (bounty.verifierType === 2 || bounty.verifierType === 3) {
    const num = parseFloat(solution);
    if (!isNaN(num)) {
      onChainSolution = String(Math.round(num * SCALE));
    }
  } else if (bounty.verifierType === 4) {
    // Convert "x=3,y=2" → "x=3000000,y=2000000"
    onChainSolution = solution.split(",").map((pair: string) => {
      const [key, val] = pair.split("=");
      const num = parseFloat(val);
      if (!isNaN(num)) return `${key}=${Math.round(num * SCALE)}`;
      return pair;
    }).join(",");
  }

  // Step 0: For TypeScript-verified types (5-7), run verification here.
  // These bounties use on-chain type 255 (pass-through), so on-chain simulation
  // won't catch wrong answers — we must check in TypeScript first.
  if (TS_ONLY_VERIFIERS.has(bounty.verifierType)) {
    try {
      // DB stores JSON config — re-serialize to binary for verification
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
  }

  // Build submit instruction
  const { ix } = buildSubmitAnswerIx({
    answerer: answererPubkey,
    answererAta,
    bountyPda,
  });

  const submitIx = ix(onChainSolution);

  // For TS-only verifiers (5-7), the on-chain fee_vault has wrong mint —
  // pay out directly via faucet mint authority instead of escrow release.
  if (TS_ONLY_VERIFIERS.has(bounty.verifierType)) {
    return handleTsOnlyPayout(bounty, wallet, solution, id, user.id, answererPubkey);
  }

  // Step 1: Simulate (free) — catches wrong answers for on-chain types 0-4
  const sim = await simulateTransaction([submitIx], answererPubkey);

  if (!sim.success) {
    const isVerificationFail =
      sim.error?.includes("VerificationFailed") ||
      sim.logs?.some((l) => l.includes("VerificationFailed"));

    const reason = isVerificationFail ? "Wrong answer" : `Verification error: ${sim.error}`;

    await prisma.bountyAttempt.create({
      data: { bountyId: id, userId: user.id, solution: solution.slice(0, 100), verified: false, reason },
    });

    return Response.json({ verified: false, reason });
  }

  // Step 2: Simulation passed — send on-chain
  try {
    const keypair = restoreKeypair(wallet.encryptedSecret);
    const txHash = await sendAndConfirm([submitIx], keypair);

    const { fee, payout } = calculateFee(bounty.amount);

    // Update DB atomically — tx already landed on-chain, must not leave DB inconsistent
    await prisma.$transaction([
      prisma.cryptoBounty.update({
        where: { id },
        data: { status: "awarded", answererId: user.id, awardTxHash: txHash, platformFee: fee },
      }),
      prisma.bountyAttempt.create({
        data: { bountyId: id, userId: user.id, solution: solution.slice(0, 100), verified: true, txHash },
      }),
      prisma.paymentLog.create({
        data: {
          type: "bounty_awarded",
          amount: payout,
          token: "USDC",
          fromWallet: bounty.vaultPda,
          toWallet: wallet.publicKey,
          txHash,
          bountyId: id,
          userId: user.id,
        },
      }),
    ]);

    // Fire webhook
    fireWebhooks(bounty.askerId, "bounty.crypto.awarded", {
      bountyId: id,
      answererId: user.id,
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      txHash,
    });

    return Response.json({
      verified: true,
      txHash,
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      explorerUrl: explorerUrl(txHash),
    });
  } catch (e: any) {
    // Check if someone else won (race condition)
    if (e.message?.includes("BountyNotActive")) {
      return Response.json({ error: "Bounty already awarded — someone beat you to it" }, { status: 409 });
    }
    console.error("Submit answer tx failed:", e);
    return Response.json({ error: `Transaction failed: ${e.message}` }, { status: 500 });
  }
}

/**
 * For TS-verified bounties (types 5-7), pay out via faucet mint authority.
 * The on-chain vault retains its USDC (can't release due to fee_vault mint mismatch
 * without a program redeploy), so we mint fresh USDC to the solver instead.
 */
async function handleTsOnlyPayout(
  bounty: any,
  wallet: any,
  solution: string,
  bountyId: string,
  userId: string,
  answererPubkey: PublicKey
): Promise<Response> {
  const faucetKeyJson = process.env.FAUCET_KEYPAIR;
  if (!faucetKeyJson) {
    return Response.json({ error: "Faucet keypair not configured" }, { status: 503 });
  }

  try {
    const { Keypair } = await import("@solana/web3.js");
    const { getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const { getConnection } = await import("@/lib/solana/client");
    const { USDC_MINT } = await import("@/lib/solana/constants");

    const faucetKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(faucetKeyJson)));
    const conn = getConnection();

    const { fee, payout } = calculateFee(bounty.amount);

    // Create/get answerer's ATA and mint payout directly
    const ata = await getOrCreateAssociatedTokenAccount(conn, faucetKp, USDC_MINT, answererPubkey);
    const txHash = await mintTo(conn, faucetKp, USDC_MINT, ata.address, faucetKp, payout);

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
          type: "bounty_awarded",
          amount: payout,
          token: "USDC",
          fromWallet: faucetKp.publicKey.toBase58(),
          toWallet: wallet.publicKey,
          txHash: String(txHash),
          bountyId,
          userId,
        },
      }),
    ]);

    fireWebhooks(bounty.askerId, "bounty.crypto.awarded", {
      bountyId,
      answererId: userId,
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      txHash: String(txHash),
    });

    return Response.json({
      verified: true,
      txHash: String(txHash),
      payout: nativeToUsdc(payout),
      fee: nativeToUsdc(fee),
      explorerUrl: explorerUrl(String(txHash)),
    });
  } catch (e: any) {
    console.error("TS-only payout failed:", e);
    return Response.json({ error: `Payout failed: ${e.message}` }, { status: 500 });
  }
}
