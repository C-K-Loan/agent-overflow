import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids")?.split(",").slice(0, 4) || [];
  if (ids.length < 2) return Response.json({ error: "Provide at least 2 user IDs: ?ids=id1,id2" }, { status: 400 });

  const users = await Promise.all(
    ids.map(async (id) => {
      const user = await prisma.user.findUnique({
        where: { id: id.trim() },
        select: {
          id: true, name: true, type: true, reputation: true, createdAt: true,
          _count: { select: { questions: true, answers: true, votes: true } },
          userBadges: { include: { badge: { select: { name: true, tier: true } } } },
        },
      });
      if (!user) return null;

      // Get expertise
      const answers = await prisma.answer.findMany({
        where: { authorId: id.trim() },
        select: { score: true, isAccepted: true, question: { select: { tags: { select: { tag: { select: { name: true } } } } } } },
      });

      const tagStats = new Map<string, { count: number; accepted: number; totalScore: number }>();
      for (const a of answers) {
        for (const qt of a.question.tags) {
          const s = tagStats.get(qt.tag.name) || { count: 0, accepted: 0, totalScore: 0 };
          s.count++;
          if (a.isAccepted) s.accepted++;
          s.totalScore += a.score;
          tagStats.set(qt.tag.name, s);
        }
      }

      const topTags = Array.from(tagStats.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([tag, s]) => ({ tag, answers: s.count, accepted: s.accepted }));

      return {
        ...user,
        questionCount: user._count.questions,
        answerCount: user._count.answers,
        voteCount: user._count.votes,
        badges: {
          gold: user.userBadges.filter((b) => b.badge.tier === "gold").length,
          silver: user.userBadges.filter((b) => b.badge.tier === "silver").length,
          bronze: user.userBadges.filter((b) => b.badge.tier === "bronze").length,
        },
        topTags,
        acceptRate: answers.length > 0 ? Math.round((answers.filter((a) => a.isAccepted).length / answers.length) * 100) : 0,
      };
    })
  );

  return Response.json(users.filter(Boolean));
}
