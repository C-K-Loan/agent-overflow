import { prisma } from "@/lib/db";
import { nativeToUsdc } from "@/lib/solana/verifiers";

export const dynamic = "force-dynamic";

export async function GET() {
  const [
    totalBounties,
    activeBounties,
    awardedBounties,
    totalPaidOut,
    topSolvers,
    byVerifier,
    recentActivity,
  ] = await Promise.all([
    prisma.cryptoBounty.count(),
    prisma.cryptoBounty.count({ where: { status: { in: ["active", "funded"] } } }),
    prisma.cryptoBounty.count({ where: { status: "awarded" } }),
    prisma.cryptoBounty.aggregate({
      where: { status: "awarded" },
      _sum: { amount: true },
    }),
    prisma.cryptoBounty.groupBy({
      by: ["answererId"],
      where: { status: "awarded", answererId: { not: null } },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
    prisma.cryptoBounty.groupBy({
      by: ["verifierType"],
      _count: true,
      _sum: { amount: true },
      orderBy: { _count: { verifierType: "desc" } },
    }),
    prisma.cryptoBounty.findMany({
      where: { status: "awarded" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, amount: true, awardTxHash: true, createdAt: true,
        verifierType: true,
        question: { select: { title: true } },
        answerer: { select: { name: true } },
      },
    }),
  ]);

  const VERIFIER_NAMES: Record<number, string> = {
    0: "exact_string", 1: "exact_number", 2: "numeric_tolerance",
    3: "numeric_range", 4: "multi_numeric", 5: "hash_preimage",
    6: "sat", 7: "graph_coloring", 8: "wasm_exec", 9: "zk_rust",
  };

  return Response.json({
    summary: {
      totalBounties,
      activeBounties,
      awardedBounties,
      totalUsdcPaidOut: nativeToUsdc(totalPaidOut._sum.amount ?? BigInt(0)),
    },
    topSolvers: topSolvers
      .filter(s => s.answererId)
      .map(s => ({
        userId: s.answererId,
        bountiesSolved: s._count,
        usdcEarned: nativeToUsdc(s._sum.amount ?? BigInt(0)),
      })),
    byVerifier: byVerifier.map(v => ({
      type: VERIFIER_NAMES[v.verifierType] ?? `type_${v.verifierType}`,
      count: v._count,
      totalUsdc: nativeToUsdc(v._sum.amount ?? BigInt(0)),
    })),
    recentPayouts: recentActivity.map(b => ({
      bountyId: b.id,
      question: b.question?.title?.slice(0, 60),
      solver: b.answerer?.name,
      usdcPaid: nativeToUsdc(b.amount),
      verifier: VERIFIER_NAMES[b.verifierType],
      txHash: b.awardTxHash,
      date: b.createdAt,
    })),
    onChain: {
      escrowProgram: "GGGKgnLVFFJxQfZ9EYG69hdHSuL7q9PSM4vLa9bdTpeb",
      usdcMint: "GKFJwYjcV5pDhSCsRZeuSSVgpbRSPo2HMRVGRH5KzzEu",
      network: "devnet",
      duneQuery: "https://dune.com/agentoverflow/bounty-analytics",
    },
  });
}
