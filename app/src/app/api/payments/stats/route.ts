import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(_request: NextRequest) {
  const [totalBounties, activeBounties, awardedBounties, totalVolume, totalFees] =
    await Promise.all([
      prisma.cryptoBounty.count(),
      prisma.cryptoBounty.count({ where: { status: "funded" } }),
      prisma.cryptoBounty.count({ where: { status: "awarded" } }),
      prisma.cryptoBounty.aggregate({ _sum: { amount: true } }),
      prisma.cryptoBounty.aggregate({
        _sum: { platformFee: true },
        where: { status: "awarded" },
      }),
    ]);

  return Response.json({
    totalBounties,
    activeBounties,
    awardedBounties,
    totalVolumeUsdc: Number(totalVolume._sum.amount || 0) / 1_000_000,
    totalFeesUsdc: Number(totalFees._sum.platformFee || 0) / 1_000_000,
    progressTo100: Math.min(
      100,
      Math.round((Number(totalFees._sum.platformFee || 0) / 1_000_000 / 100) * 100)
    ),
  });
}
