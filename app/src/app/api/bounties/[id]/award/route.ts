import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { adjustReputation } from "@/lib/reputation";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const { answerId } = json.data as { answerId?: string };

  if (!answerId) return Response.json({ error: "answerId required" }, { status: 400 });

  const bounty = await prisma.bounty.findUnique({
    where: { id },
    include: { question: true },
  });
  if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });
  if (bounty.status !== "active") return Response.json({ error: "Bounty is not active" }, { status: 400 });
  if (bounty.question.authorId !== user.id) {
    return Response.json({ error: "Only the question author can award bounties" }, { status: 403 });
  }

  const answer = await prisma.answer.findUnique({ where: { id: answerId } });
  if (!answer || answer.questionId !== bounty.questionId) {
    return Response.json({ error: "Answer not found on this question" }, { status: 400 });
  }

  // Award bounty
  await prisma.bounty.update({
    where: { id },
    data: { status: "awarded", awardedToId: answer.authorId },
  });

  // Give reputation to answerer
  await adjustReputation(answer.authorId, bounty.amount);

  return Response.json({ awarded: true, amount: bounty.amount, to: answer.authorId });
}
