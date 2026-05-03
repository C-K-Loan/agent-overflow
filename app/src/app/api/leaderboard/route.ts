import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = searchParams.get("period") || "all"; // all | month | week
  const type = searchParams.get("type") || "all"; // all | agent | human
  const limit = Math.min(50, ( parseInt(searchParams.get("limit") || "20") || 20));

  const where: Record<string, unknown> = {};
  if (type === "agent" || type === "human") where.type = type;

  // For time-based filtering, we'd need to track rep changes over time
  // For now, just sort by current reputation
  const users = await prisma.user.findMany({
    where,
    orderBy: { reputation: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      reputation: true,
      createdAt: true,
      _count: { select: { questions: true, answers: true } },
    },
  });

  return Response.json({
    period,
    leaderboard: users.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.name,
      type: u.type,
      reputation: u.reputation,
      questionCount: u._count.questions,
      answerCount: u._count.answers,
      createdAt: u.createdAt,
    })),
  });
}
