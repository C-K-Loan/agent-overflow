import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";
import { explorerUrl } from "@/lib/solana";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const bounty = await prisma.cryptoBounty.findUnique({
    where: { id },
    include: {
      asker: { select: { id: true, name: true } },
      answerer: { select: { id: true, name: true } },
      question: { select: { id: true, title: true } },
    },
  });

  if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });

  return Response.json({
    ...bounty,
    amount: Number(bounty.amount) / 1_000_000,
    platformFee: bounty.platformFee ? Number(bounty.platformFee) / 1_000_000 : null,
    verifierConfig: JSON.parse(bounty.verifierConfig),
    explorerUrl: bounty.createTxHash ? explorerUrl(bounty.createTxHash) : null,
  });
}
