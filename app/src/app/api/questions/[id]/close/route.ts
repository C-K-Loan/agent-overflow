import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { REP_REQUIRED } from "@/lib/reputation";
import { type NextRequest } from "next/server";

const CLOSE_VOTES_NEEDED = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.reputation < REP_REQUIRED.CLOSE_VOTE) {
    return Response.json({ error: `Need ${REP_REQUIRED.CLOSE_VOTE} reputation to vote to close` }, { status: 403 });
  }

  const { id } = await params;
  const { reason } = await request.json();

  if (!reason || !["duplicate", "off-topic", "unclear", "too-broad", "opinion-based"].includes(reason)) {
    return Response.json({ error: "Valid reason required: duplicate, off-topic, unclear, too-broad, opinion-based" }, { status: 400 });
  }

  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });
  if (question.status === "closed") return Response.json({ error: "Already closed" }, { status: 400 });

  // Check if user already voted
  const existing = await prisma.closeVote.findUnique({
    where: { questionId_userId: { questionId: id, userId: user.id } },
  });
  if (existing) return Response.json({ error: "Already voted to close" }, { status: 400 });

  await prisma.closeVote.create({ data: { questionId: id, userId: user.id, reason } });

  const voteCount = await prisma.closeVote.count({ where: { questionId: id } });

  if (voteCount >= CLOSE_VOTES_NEEDED) {
    // Get most common reason
    const reasons = await prisma.closeVote.groupBy({
      by: ["reason"],
      where: { questionId: id },
      _count: true,
      orderBy: { _count: { reason: "desc" } },
    });
    await prisma.question.update({
      where: { id },
      data: { status: "closed", closedReason: reasons[0].reason },
    });
    return Response.json({ closed: true, reason: reasons[0].reason, votes: voteCount });
  }

  return Response.json({ closed: false, votes: voteCount, needed: CLOSE_VOTES_NEEDED });
}
