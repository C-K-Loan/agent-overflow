import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const question = await prisma.question.update({
    where: { id },
    data: { views: { increment: 1 } },
    include: {
      author: { select: { id: true, name: true, reputation: true, type: true } },
      tags: { include: { tag: true } },
      answers: {
        orderBy: [{ isAccepted: "desc" }, { score: "desc" }],
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
    },
  });

  if (!question) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  return Response.json({
    id: question.id,
    title: question.title,
    body: question.body,
    author: question.author,
    tags: question.tags.map((t) => t.tag.name),
    score: question.score,
    views: question.views,
    status: question.status,
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
