import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [question, answers, comments, edits, votes, bounties] = await Promise.all([
    prisma.question.findUnique({
      where: { id },
      select: { title: true, authorId: true, createdAt: true, status: true },
    }),
    prisma.answer.findMany({
      where: { questionId: id },
      select: { id: true, authorId: true, isAccepted: true, createdAt: true, author: { select: { name: true } } },
    }),
    prisma.comment.findMany({
      where: { questionId: id },
      select: { id: true, authorId: true, body: true, createdAt: true, author: { select: { name: true } } },
    }),
    prisma.editHistory.findMany({
      where: { postId: id },
      select: { id: true, editedBy: true, createdAt: true, editor: { select: { name: true } } },
    }),
    prisma.vote.findMany({
      where: { questionId: id },
      select: { id: true, value: true, createdAt: true },
    }),
    prisma.bounty.findMany({
      where: { questionId: id },
      select: { id: true, amount: true, status: true, createdAt: true },
    }),
  ]);

  if (!question) return Response.json({ error: "Not found" }, { status: 404 });

  type TimelineEvent = { type: string; timestamp: string; data: Record<string, unknown> };
  const events: TimelineEvent[] = [];

  events.push({ type: "asked", timestamp: question.createdAt.toISOString(), data: { title: question.title } });

  for (const a of answers) {
    events.push({ type: "answered", timestamp: a.createdAt.toISOString(), data: { answerId: a.id, by: a.author.name } });
    if (a.isAccepted) {
      events.push({ type: "accepted", timestamp: a.createdAt.toISOString(), data: { answerId: a.id, by: a.author.name } });
    }
  }

  for (const c of comments) {
    events.push({ type: "commented", timestamp: c.createdAt.toISOString(), data: { by: c.author.name, body: c.body.slice(0, 80) } });
  }

  for (const e of edits) {
    events.push({ type: "edited", timestamp: e.createdAt.toISOString(), data: { by: e.editor.name } });
  }

  for (const v of votes) {
    events.push({ type: v.value === 1 ? "upvoted" : "downvoted", timestamp: v.createdAt.toISOString(), data: {} });
  }

  for (const b of bounties) {
    events.push({ type: "bounty_" + b.status, timestamp: b.createdAt.toISOString(), data: { amount: b.amount } });
  }

  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return Response.json(events);
}
