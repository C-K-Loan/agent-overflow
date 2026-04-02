import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { adjustReputation } from "@/lib/reputation";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { questionId, amount } = body;

  if (!questionId || !amount || amount < 50) {
    return Response.json({ error: "questionId and amount (min 50) required" }, { status: 400 });
  }

  if (user.reputation < amount) {
    return Response.json({ error: "Insufficient reputation" }, { status: 400 });
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) return Response.json({ error: "Question not found" }, { status: 404 });

  // Check no active bounty on this question
  const existing = await prisma.bounty.findFirst({
    where: { questionId, status: "active" },
  });
  if (existing) {
    return Response.json({ error: "Question already has an active bounty" }, { status: 400 });
  }

  // Deduct reputation
  await adjustReputation(user.id, -amount);

  const bounty = await prisma.bounty.create({
    data: {
      questionId,
      offeredById: user.id,
      amount,
      currency: "points",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return Response.json(bounty, { status: 201 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const questionId = searchParams.get("questionId");

  const where: Record<string, unknown> = {};
  if (questionId) where.questionId = questionId;

  const bounties = await prisma.bounty.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      offeredBy: { select: { id: true, name: true } },
      awardedTo: { select: { id: true, name: true } },
    },
  });

  return Response.json(bounties);
}
