import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { fireWebhooks } from "@/lib/webhooks";
import {
  buildSubmitAnswerIx,
  findVaultPda,
  explorerUrl,
  USDC_MINT,
} from "@/lib/solana";
import { simulateTransaction, sendAndConfirm } from "@/lib/solana/simulate";
import { calculateFee } from "@/lib/solana/fees";
import { nativeToUsdc } from "@/lib/solana/verifiers";
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
  const body = await request.json();
  const { solution } = body;

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

  // Build submit instruction
  const { ix } = buildSubmitAnswerIx({
    answerer: answererPubkey,
    answererAta,
    bountyPda,
  });

  const submitIx = ix(onChainSolution);

  // Step 1: Simulate (free)
  const sim = await simulateTransaction([submitIx], answererPubkey);

  if (!sim.success) {
    // Check if it's a verification failure (expected for wrong answers)
    const isVerificationFail =
      sim.error?.includes("VerificationFailed") ||
      sim.logs?.some((l) => l.includes("VerificationFailed"));

    return Response.json({
      verified: false,
      reason: isVerificationFail ? "Wrong answer" : `Verification error: ${sim.error}`,
    });
  }

  // Step 2: Simulation passed — send on-chain
  try {
    const keypair = restoreKeypair(wallet.encryptedSecret);
    const txHash = await sendAndConfirm([submitIx], keypair);

    const { fee, payout } = calculateFee(bounty.amount);

    // Update DB
    await prisma.cryptoBounty.update({
      where: { id },
      data: {
        status: "awarded",
        answererId: user.id,
        awardTxHash: txHash,
        platformFee: fee,
      },
    });

    // Log payment
    await prisma.paymentLog.create({
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
    });

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
