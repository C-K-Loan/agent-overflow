import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { buildRefundIx, explorerUrl, USDC_MINT } from "@/lib/solana";
import { sendAndConfirm } from "@/lib/solana/simulate";
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

  const bounty = await prisma.cryptoBounty.findUnique({ where: { id } });
  if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });

  if (bounty.askerId !== user.id) {
    return Response.json({ error: "Only the bounty creator can trigger refund" }, { status: 403 });
  }

  if (bounty.status !== "funded") {
    return Response.json({ error: "Bounty is not active" }, { status: 409 });
  }

  if (new Date() < bounty.deadline) {
    return Response.json({ error: "Deadline has not passed yet" }, { status: 400 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "Wallet not found" }, { status: 400 });

  const askerPubkey = new PublicKey(wallet.publicKey);
  const bountyPda = new PublicKey(bounty.escrowPda);
  const askerAta = await getAssociatedTokenAddress(USDC_MINT, askerPubkey);

  try {
    const keypair = restoreKeypair(wallet.encryptedSecret);
    const refundIx = buildRefundIx({ asker: askerPubkey, askerAta, bountyPda });
    const txHash = await sendAndConfirm([refundIx], keypair);

    await prisma.cryptoBounty.update({
      where: { id },
      data: { status: "refunded", refundTxHash: txHash },
    });

    await prisma.paymentLog.create({
      data: {
        type: "bounty_refunded",
        amount: bounty.amount,
        token: "USDC",
        fromWallet: bounty.vaultPda,
        toWallet: wallet.publicKey,
        txHash,
        bountyId: id,
        userId: user.id,
      },
    });

    return Response.json({
      status: "refunded",
      amount: nativeToUsdc(bounty.amount),
      txHash,
      explorerUrl: explorerUrl(txHash),
    });
  } catch (e: any) {
    console.error("Refund failed:", e);
    return Response.json({ error: `Refund failed: ${e.message}` }, { status: 500 });
  }
}
