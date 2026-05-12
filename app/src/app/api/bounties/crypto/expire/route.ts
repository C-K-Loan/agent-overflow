import { prisma } from "@/lib/db";
import { buildRefundIx, USDC_MINT } from "@/lib/solana";
import { sendAndConfirm } from "@/lib/solana/simulate";
import { restoreKeypair } from "@/lib/solana/wallet";
import { fireWebhooks } from "@/lib/webhooks";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

import { type NextRequest } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

/** Cron endpoint: refund all expired crypto bounties */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expired = await prisma.cryptoBounty.findMany({
    where: { status: "funded", deadline: { lte: new Date() } },
    include: { asker: true },
  });

  const results = [];

  for (const bounty of expired) {
    try {
      const wallet = await prisma.userWallet.findUnique({
        where: { userId: bounty.askerId },
      });
      if (!wallet) {
        results.push({ bountyId: bounty.id, action: "skipped", reason: "no wallet" });
        continue;
      }

      const askerPubkey = new PublicKey(wallet.publicKey);
      const bountyPda = new PublicKey(bounty.escrowPda);
      const askerAta = await getAssociatedTokenAddress(USDC_MINT, askerPubkey);

      const keypair = restoreKeypair(wallet.encryptedSecret);
      const refundIx = buildRefundIx({ asker: askerPubkey, askerAta, bountyPda });
      const txHash = await sendAndConfirm([refundIx], keypair);

      await prisma.cryptoBounty.update({
        where: { id: bounty.id },
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
          bountyId: bounty.id,
          userId: bounty.askerId,
        },
      });

      await fireWebhooks(bounty.askerId, "bounty.crypto.refunded", {
        bountyId: bounty.id,
        questionId: bounty.questionId,
        amount: Number(bounty.amount) / 1_000_000,
        txHash,
      });

      results.push({ bountyId: bounty.id, action: "refunded", txHash });
    } catch (e: unknown) {
      results.push({ bountyId: bounty.id, action: "error", error: (e as Error).message });
    }
  }

  return Response.json({ processed: results.length, results });
}
