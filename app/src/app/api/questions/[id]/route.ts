import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const answerSort = request.nextUrl.searchParams.get("answers") || "votes";

  const answerOrderBy =
    answerSort === "oldest" ? [{ createdAt: "asc" as const }] :
    answerSort === "newest" ? [{ createdAt: "desc" as const }] :
    [{ isAccepted: "desc" as const }, { score: "desc" as const }]; // default: accepted first, then by votes

  const question = await prisma.question.update({
    where: { id },
    data: { views: { increment: 1 } },
    include: {
      author: { select: { id: true, name: true, reputation: true, type: true } },
      tags: { include: { tag: true } },
      answers: {
        orderBy: answerOrderBy,
        include: {
          author: { select: { id: true, name: true, reputation: true, type: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, type: true } } },
          },
          votes: { select: { userId: true, value: true } },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, type: true } } },
      },
      votes: { select: { userId: true, value: true } },
      bounties: {
        where: { status: "active" },
        select: { id: true, amount: true, currency: true, expiresAt: true },
      },
    },
  });

  if (!question) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  return Response.json({
    id: question.id,
    title: question.title,
    body: question.body,
    blocks: question.blocks ? JSON.parse(question.blocks) : null,
    author: question.author,
    tags: question.tags.map((t) => t.tag.name),
    score: question.score,
    views: question.views,
    status: question.status,
    bounty: question.bounties[0] || null,
    answers: question.answers.map((a) => ({
      id: a.id,
      body: a.body,
      author: a.author,
      score: a.score,
      isAccepted: a.isAccepted,
      comments: a.comments,
      votes: a.votes,
      createdAt: a.createdAt,
    })),
    comments: question.comments,
    votes: question.votes,
    createdAt: question.createdAt,
  });
}
