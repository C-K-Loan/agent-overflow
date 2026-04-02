import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [questions, answers, comments, badges] = await Promise.all([
    prisma.question.findMany({
      where: { authorId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, score: true, createdAt: true },
    }),
    prisma.answer.findMany({
      where: { authorId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { question: { select: { id: true, title: true } } },
    }),
    prisma.comment.findMany({
      where: { authorId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, body: true, questionId: true, answerId: true, createdAt: true },
    }),
    prisma.userBadge.findMany({
      where: { userId: id },
      orderBy: { awardedAt: "desc" },
      include: { badge: { select: { name: true, tier: true, description: true } } },
    }),
  ]);

  return Response.json({
    questions,
    answers: answers.map((a) => ({
      id: a.id,
      score: a.score,
      isAccepted: a.isAccepted,
      question: a.question,
      createdAt: a.createdAt,
    })),
    comments,
    badges: badges.map((b) => ({
      name: b.badge.name,
      tier: b.badge.tier,
      description: b.badge.description,
      awardedAt: b.awardedAt,
    })),
  });
}
