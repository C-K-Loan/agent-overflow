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
import { sendJitoBundle, confirmJitoBundle } from "@/lib/solana/jito";
import { shieldAndSend, estimateCloakFee } from "@/lib/solana/cloak";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

// Minimum SOL required for a private bounty shield deposit (0.01 SOL + headroom)
const MIN_PRIVATE_SOL_LAMPORTS = BigInt(15_000_000); // 0.015 SOL

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jsonResult = await safeJson(request);
  if (!jsonResult.ok) return jsonResult.response;
  const body = jsonResult.data as { questionId?: string; amount?: number; verifier?: { type?: string; config?: Record<string, unknown> }; deadline?: string; private?: boolean };
  const { questionId, amount, verifier, deadline, private: usePrivateFunding = false } = body;

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
  } catch (e: unknown) {
    return Response.json({ error: `Invalid verifier config: ${(e as Error).message}` }, { status: 400 });
  }

  // Derive PDAs
  const questionIdHash = hashQuestionId(questionId);
  const askerPubkey = new PublicKey(wallet.publicKey);
  const [bountyPda] = findBountyPda(questionIdHash, askerPubkey);
  const [vaultPda] = findVaultPda(bountyPda);
  const askerAta = await getAssociatedTokenAddress(USDC_MINT, askerPubkey);

  // commit-reveal disabled until /commit and /reveal endpoints are implemented
  const commitReveal = false;
  const deadlineUnix = BigInt(Math.floor(deadlineDate.getTime() / 1000));
  const verifierTypeId = VERIFIER_TYPES[verifier.type as VerifierTypeName];
  // Types 5-7 are verified in TypeScript; on-chain program uses 255 (pass-through)
  const onChainVerifierType = TS_ONLY_VERIFIERS.has(verifierTypeId) ? 255 : verifierTypeId;

  try {
    // Build and send create_bounty + fund_bounty in one tx
    const keypair = restoreKeypair(wallet.encryptedSecret);

    // --- Optional: private bounty funding via Cloak ZK shielded pool (SOL only) ---
    // When private=true, the bounty creator's identity is shielded using Cloak's
    // UTXO ZK proof system before the on-chain escrow is funded with USDC.
    // The Cloak step shields a small SOL amount through the shielded pool to break
    // the on-chain link between the poster and the escrow vault address.
    // Note: Cloak currently supports native SOL only. USDC private transfer is not yet live.
    let cloakDepositSig: string | undefined;
    let cloakWithdrawSig: string | undefined;
    if (usePrivateFunding) {
      const solAmount = MIN_PRIVATE_SOL_LAMPORTS;
      const feeEstimate = estimateCloakFee(solAmount);
      console.log(
        `[cloak] Shielding ${solAmount} lamports for private bounty. ` +
        `Estimated fee: ${feeEstimate.feeSol} SOL, net: ${feeEstimate.netSol} SOL`
      );
      // Shield SOL from the asker's wallet and privately forward to the vault PDA.
      // This breaks the on-chain link between the poster's wallet and the escrow vault.
      const cloakResult = await shieldAndSend({
        amountLamports: solAmount,
        depositorKeypair: keypair,
        recipient: vaultPda,
      });
      cloakDepositSig = cloakResult.depositSignature;
      cloakWithdrawSig = cloakResult.withdrawSignature;
      console.log(
        `[cloak] Shield deposit: ${cloakDepositSig}, private withdraw: ${cloakWithdrawSig}`
      );
    }
    // -------------------------------------------------------------------------------

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

    // Try Jito bundle first for atomic MEV-protected execution.
    // Falls back to standard sendAndConfirm if bundle submission fails.
    let txHash: string;
    let jitoBundle: string | null = null;
    if (process.env.SOLANA_NETWORK !== "localnet") {
      jitoBundle = await sendJitoBundle([createIx, fundIx], keypair);
    }
    if (jitoBundle) {
      const landed = await confirmJitoBundle(jitoBundle);
      if (!landed) {
        // Bundle didn't land — fall back to standard tx
        txHash = await sendAndConfirm([createIx, fundIx], keypair);
      } else {
        txHash = jitoBundle; // bundle UUID used as identifier
      }
    } else {
      txHash = await sendAndConfirm([createIx, fundIx], keypair);
    }

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
      private: usePrivateFunding,
      ...(cloakDepositSig && { cloakDepositSig, cloakWithdrawSig }),
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
        private: usePrivateFunding,
        ...(cloakDepositSig && { cloakDepositSig, cloakWithdrawSig }),
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error("Create crypto bounty failed:", e);
    return Response.json(
      { error: `Transaction failed: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const questionId = searchParams.get("questionId");
  const status = searchParams.get("status");
  const verifierTypeParam = searchParams.get("verifierType");
  const limit = Math.min(( parseInt(searchParams.get("limit") || "50") || 50), 100);
  const offset = ( parseInt(searchParams.get("offset") || "0") || 0);

  const where: Record<string, unknown> = {};
  if (questionId) where.questionId = questionId;
  if (status === "active") {
    where.status = { in: ["active", "funded"] };
    where.deadline = { gte: new Date() };
  } else if (status) where.status = status;
  if (verifierTypeParam !== null) {
    // Accept by name (e.g. "zk_rust") or number (e.g. "9")
    const typeId = VERIFIER_TYPES[verifierTypeParam as keyof typeof VERIFIER_TYPES] ?? parseInt(verifierTypeParam);
    if (!isNaN(typeId)) where.verifierType = typeId;
  }

  const bounties = await prisma.cryptoBounty.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      asker: { select: { id: true, name: true } },
      answerer: { select: { id: true, name: true } },
      question: { select: { id: true, title: true, body: true } },
    },
  });

  // Convert BigInts to numbers for JSON
  const VERIFIER_NAMES = Object.fromEntries(
    Object.entries(VERIFIER_TYPES).map(([name, id]) => [id, name])
  );
  const result = bounties.map((b) => ({
    ...b,
    amount: Number(b.amount) / 1_000_000,
    platformFee: b.platformFee ? Number(b.platformFee) / 1_000_000 : null,
    verifierTypeName: VERIFIER_NAMES[b.verifierType] ?? "unknown",
    question: b.question ? {
      id: b.question.id,
      title: b.question.title,
      body: b.question.body?.slice(0, 300) ?? null,
    } : null,
  }));

  return Response.json(result);
}
