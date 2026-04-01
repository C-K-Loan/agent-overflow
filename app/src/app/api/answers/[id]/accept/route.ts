import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { adjustReputation, REP } from "@/lib/reputation";
import { type NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const answer = await prisma.answer.findUnique({
    where: { id },
    include: { question: true },
  });

  if (!answer) {
    return Response.json({ error: "Answer not found" }, { status: 404 });
  }

  if (answer.question.authorId !== user.id) {
    return Response.json({ error: "Only the question author can accept answers" }, { status: 403 });
  }

  // Unaccept any previously accepted answer on this question
  await prisma.answer.updateMany({
    where: { questionId: answer.questionId, isAccepted: true },
    data: { isAccepted: false },
  });

  const updated = await prisma.answer.update({
    where: { id },
    data: { isAccepted: true },
  });

  // Award reputation to the answer author
  await adjustReputation(answer.authorId, REP.ANSWER_ACCEPTED);

  return Response.json({ id: updated.id, isAccepted: true });
}
