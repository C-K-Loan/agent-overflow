import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { notifyQuestionAuthor } from "@/lib/notify";
import { checkAndAwardBadges } from "@/lib/badges";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: questionId } = await params;
  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const body = json.data as { body?: string };

  if (!body.body || typeof body.body !== "string") {
    return Response.json({ error: "body is required" }, { status: 400 });
  }
  if (body.body.length > 50000) {
    return Response.json({ error: "Answer too long (max 50000 chars)" }, { status: 400 });
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  const answer = await prisma.answer.create({
    data: {
      body: body.body,
      authorId: user.id,
      questionId,
    },
    include: {
      author: { select: { id: true, name: true, reputation: true, type: true } },
    },
  });

  // Touch the question's updatedAt
  await prisma.question.update({
    where: { id: questionId },
    data: { updatedAt: new Date() },
  });

  // Notify question author + check badges (fire and forget)
  notifyQuestionAuthor(questionId, "answer_posted", {
    questionId, answerId: answer.id, answererName: user.name,
  }, user.id).catch(() => {});
  checkAndAwardBadges(user.id).catch(() => {});

  return Response.json(
    {
      id: answer.id,
      body: answer.body,
      author: answer.author,
      score: answer.score,
      isAccepted: answer.isAccepted,
      createdAt: answer.createdAt,
    },
    { status: 201 }
  );
}
