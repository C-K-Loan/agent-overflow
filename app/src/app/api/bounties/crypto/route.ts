import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { safeJson } from "@/lib/schemas";
import { fireWebhooks } from "@/lib/webhooks";
import {
  hashQuestionId,
  findBountyPda,
  findVaultPda,
  buildCreateBountyIx,
  buildFundBountyIx,
  sendAndConfirm,
  explorerUrl,
  usdcToNative,
  USDC_MINT,
  COMMIT_REVEAL_THRESHOLD,
  MIN_BOUNTY_AMOUNT,
  MAX_BOUNTY_AMOUNT,
} from "@/lib/solana";
import {
  VERIFIER_TYPES,
  TS_ONLY_VERIFIERS,
  serializeVerifierConfig,
  type VerifierTypeName,
} from "@/lib/solana/verifiers";
import { restoreKeypair } from "@/lib/solana/wallet";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await safeJson(request);
  if (!jsonResult.ok) return jsonResult.response;
  const body = jsonResult.data as { questionId?: string; amount?: number; verifier?: { type?: string; config?: Record<string, unknown> }; deadline?: string };
  const { questionId, amount, verifier, deadline } = body;

  // Idempotency: check Idempotency-Key header
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.paymentLog.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const bounty = await prisma.cryptoBounty.findFirst({ where: { id: existing.bountyId ?? undefined } });
      if (bounty) return Response.json({ id: bounty.id, status: bounty.status, message: "Already created (idempotent)" });
    }
  }

  // Validate required fields
  if (!questionId || !amount || !verifier?.type || !deadline) {
    return Response.json(
      { error: "questionId, amount, verifier (type + config), and deadline required" },
      { status: 400 }
    );
  }

  // Validate verifier type
  if (!(verifier.type in VERIFIER_TYPES)) {
    return Response.json(
      { error: `Unknown verifier type: ${verifier.type}. Valid: ${Object.keys(VERIFIER_TYPES).join(", ")}` },
      { status: 400 }
    );
  }

  // Validate amount
  const nativeAmount = usdcToNative(amount);
  if (nativeAmount < MIN_BOUNTY_AMOUNT) {
    return Response.json({ error: "Minimum bounty amount is $1 USDC" }, { status: 400 });
  }
  if (nativeAmount > MAX_BOUNTY_AMOUNT) {
    return Response.json({ error: "Maximum bounty amount is $1M USDC" }, { status: 400 });
  }

  // Validate deadline
  const deadlineDate = new Date(deadline);
  const now = Date.now();
  const durationMs = deadlineDate.getTime() - now;
  if (durationMs < 3600_000) {
    return Response.json({ error: "Deadline must be at least 1 hour from now" }, { status: 400 });
  }
  if (durationMs > 90 * 86400_000) {
    return Response.json({ error: "Deadline must be within 90 days" }, { status: 400 });
  }

  // Check question exists
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });

  // Check no existing active crypto bounty
  const existing = await prisma.cryptoBounty.findFirst({
    where: { questionId, askerId: user.id, status: { in: ["active", "funded"] } },
  });
  if (existing) {
    return Response.json({ error: "Active crypto bounty already exists for this question" }, { status: 409 });
  }

  // Get user wallet
  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    return Response.json({ error: "No wallet found. Create one first: POST /api/wallet/create" }, { status: 400 });
  }

  // Serialize verifier config
  let configBuf: Buffer;
  try {
    configBuf = serializeVerifierConfig(verifier.type as VerifierTypeName, verifier.config || {});
  } catch (e: any) {
    return Response.json({ error: `Invalid verifier config: ${e.message}` }, { status: 400 });
  }

  // Derive PDAs
  const questionIdHash = hashQuestionId(questionId);
  const askerPubkey = new PublicKey(wallet.publicKey);
  const [bountyPda] = findBountyPda(questionIdHash, askerPubkey);
  const [vaultPda] = findVaultPda(bountyPda);
  const askerAta = await getAssociatedTokenAddress(USDC_MINT, askerPubkey);

  const commitReveal = nativeAmount > COMMIT_REVEAL_THRESHOLD;
  const deadlineUnix = BigInt(Math.floor(deadlineDate.getTime() / 1000));
  const verifierTypeId = VERIFIER_TYPES[verifier.type as VerifierTypeName];
  // Types 5-7 are verified in TypeScript; on-chain program uses 255 (pass-through)
  const onChainVerifierType = TS_ONLY_VERIFIERS.has(verifierTypeId) ? 255 : verifierTypeId;

  try {
    // Build and send create_bounty + fund_bounty in one tx
    const keypair = restoreKeypair(wallet.encryptedSecret);

    const createIx = buildCreateBountyIx({
      asker: askerPubkey,
      askerAta,
      questionIdHash,
      amount: nativeAmount,
      verifierType: onChainVerifierType,
      verifierConfig: configBuf,
      deadline: deadlineUnix,
    });

    const fundIx = buildFundBountyIx({
      asker: askerPubkey,
      askerAta,
      bountyPda,
    });

    const txHash = await sendAndConfirm([createIx, fundIx], keypair);

    // Save to DB
    const cryptoBounty = await prisma.cryptoBounty.create({
      data: {
        questionId,
        askerId: user.id,
        amount: nativeAmount,
        tokenMint: USDC_MINT.toBase58(),
        verifierType: verifierTypeId,
        verifierConfig: JSON.stringify(verifier.config),
        escrowPda: bountyPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        status: "funded",
        commitReveal,
        deadline: deadlineDate,
        createTxHash: txHash,
        fundTxHash: txHash,
      },
    });

    // Log payment
    await prisma.paymentLog.create({
      data: {
        type: "bounty_created",
        amount: nativeAmount,
        token: "USDC",
        fromWallet: wallet.publicKey,
        toWallet: vaultPda.toBase58(),
        txHash,
        bountyId: cryptoBounty.id,
        userId: user.id,
      },
    });

    // Fire webhook
    fireWebhooks(user.id, "bounty.crypto.created", {
      bountyId: cryptoBounty.id,
      questionId,
      amount,
      verifierType: verifier.type,
      deadline: deadlineDate.toISOString(),
      txHash,
    });

    return Response.json(
      {
        id: cryptoBounty.id,
        escrowPda: bountyPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        txHash,
        status: "funded",
        amount,
        verifierType: verifier.type,
        commitReveal,
        deadline: deadlineDate.toISOString(),
        explorerUrl: explorerUrl(txHash),
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("Create crypto bounty failed:", e);
    return Response.json(
      { error: `Transaction failed: ${e.message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const questionId = searchParams.get("questionId");
  const status = searchParams.get("status");
  const limit = Math.min(( parseInt(searchParams.get("limit") || "50") || 50), 100);
  const offset = ( parseInt(searchParams.get("offset") || "0") || 0);

  const where: Record<string, unknown> = {};
  if (questionId) where.questionId = questionId;
  if (status) where.status = status;

  const bounties = await prisma.cryptoBounty.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      asker: { select: { id: true, name: true } },
      answerer: { select: { id: true, name: true } },
      question: { select: { id: true, title: true } },
    },
  });

  // Convert BigInts to numbers for JSON
  const result = bounties.map((b) => ({
    ...b,
    amount: Number(b.amount) / 1_000_000,
    platformFee: b.platformFee ? Number(b.platformFee) / 1_000_000 : null,
  }));

  return Response.json(result);
}
