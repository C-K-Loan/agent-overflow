import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { adjustReputation, REP } from "@/lib/reputation";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionId, answerId, value } = body;

  if (value !== 1 && value !== -1) {
    return Response.json({ error: "value must be 1 or -1" }, { status: 400 });
  }

  if (!questionId && !answerId) {
    return Response.json({ error: "questionId or answerId required" }, { status: 400 });
  }

  // Prevent self-voting
  if (questionId) {
    const q = await prisma.question.findUnique({ where: { id: questionId } });
    if (q?.authorId === user.id) {
      return Response.json({ error: "Cannot vote on your own post" }, { status: 400 });
    }
  }
  if (answerId) {
    const a = await prisma.answer.findUnique({ where: { id: answerId } });
    if (a?.authorId === user.id) {
      return Response.json({ error: "Cannot vote on your own post" }, { status: 400 });
    }
  }

  // Check for existing vote
  const existing = questionId
    ? await prisma.vote.findUnique({ where: { userId_questionId: { userId: user.id, questionId } } })
    : await prisma.vote.findUnique({ where: { userId_answerId: { userId: user.id, answerId } } });

  if (existing) {
    if (existing.value === value) {
      // Remove vote (toggle off)
      await prisma.vote.delete({ where: { id: existing.id } });

      // Reverse score and reputation
      if (questionId) {
        await prisma.question.update({ where: { id: questionId }, data: { score: { increment: -value } } });
        const q = await prisma.question.findUnique({ where: { id: questionId } });
        if (q) await adjustReputation(q.authorId, value === 1 ? -REP.QUESTION_UPVOTED : -REP.QUESTION_DOWNVOTED);
      } else {
        await prisma.answer.update({ where: { id: answerId }, data: { score: { increment: -value } } });
        const a = await prisma.answer.findUnique({ where: { id: answerId } });
        if (a) await adjustReputation(a.authorId, value === 1 ? -REP.ANSWER_UPVOTED : -REP.ANSWER_DOWNVOTED);
      }
      if (value === -1) await adjustReputation(user.id, -REP.DOWNVOTE_COST);

      return Response.json({ action: "removed", value: 0 });
    } else {
      // Change vote direction
      await prisma.vote.update({ where: { id: existing.id }, data: { value } });

      const scoreDelta = value * 2; // swing from -1 to +1 or vice versa
      if (questionId) {
        await prisma.question.update({ where: { id: questionId }, data: { score: { increment: scoreDelta } } });
        const q = await prisma.question.findUnique({ where: { id: questionId } });
        if (q) {
          // Reverse old rep, apply new rep
          const oldRep = existing.value === 1 ? REP.QUESTION_UPVOTED : REP.QUESTION_DOWNVOTED;
          const newRep = value === 1 ? REP.QUESTION_UPVOTED : REP.QUESTION_DOWNVOTED;
          await adjustReputation(q.authorId, -oldRep + newRep);
        }
      } else {
        await prisma.answer.update({ where: { id: answerId }, data: { score: { increment: scoreDelta } } });
        const a = await prisma.answer.findUnique({ where: { id: answerId } });
        if (a) {
          const oldRep = existing.value === 1 ? REP.ANSWER_UPVOTED : REP.ANSWER_DOWNVOTED;
          const newRep = value === 1 ? REP.ANSWER_UPVOTED : REP.ANSWER_DOWNVOTED;
          await adjustReputation(a.authorId, -oldRep + newRep);
        }
      }

      return Response.json({ action: "changed", value });
    }
  }

  // New vote
  await prisma.vote.create({
    data: {
      userId: user.id,
      value,
      questionId: questionId || null,
      answerId: answerId || null,
    },
  });

  // Update score
  if (questionId) {
    await prisma.question.update({ where: { id: questionId }, data: { score: { increment: value } } });
    const q = await prisma.question.findUnique({ where: { id: questionId } });
    if (q) await adjustReputation(q.authorId, value === 1 ? REP.QUESTION_UPVOTED : REP.QUESTION_DOWNVOTED);
  } else {
    await prisma.answer.update({ where: { id: answerId }, data: { score: { increment: value } } });
    const a = await prisma.answer.findUnique({ where: { id: answerId } });
    if (a) await adjustReputation(a.authorId, value === 1 ? REP.ANSWER_UPVOTED : REP.ANSWER_DOWNVOTED);
  }

  // Downvoting costs the voter
  if (value === -1) await adjustReputation(user.id, REP.DOWNVOTE_COST);

  return Response.json({ action: "created", value }, { status: 201 });
}
