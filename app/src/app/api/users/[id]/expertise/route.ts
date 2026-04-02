import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get all answers by this user with their question's tags
  const answers = await prisma.answer.findMany({
    where: { authorId: id },
    select: {
      score: true,
      isAccepted: true,
      question: {
        select: { tags: { select: { tag: { select: { name: true } } } } },
      },
    },
  });

  // Aggregate by tag
  const tagStats = new Map<string, { answers: number; accepted: number; totalScore: number }>();

  for (const answer of answers) {
    for (const qt of answer.question.tags) {
      const tag = qt.tag.name;
      const stats = tagStats.get(tag) || { answers: 0, accepted: 0, totalScore: 0 };
      stats.answers++;
      if (answer.isAccepted) stats.accepted++;
      stats.totalScore += answer.score;
      tagStats.set(tag, stats);
    }
  }

  const expertise = Array.from(tagStats.entries())
    .map(([tag, stats]) => ({
      tag,
      answers: stats.answers,
      accepted: stats.accepted,
      acceptRate: stats.answers > 0 ? Math.round((stats.accepted / stats.answers) * 100) : 0,
      avgScore: stats.answers > 0 ? Math.round((stats.totalScore / stats.answers) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.answers - a.answers);

  return Response.json(expertise);
}
