import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { REP_REQUIRED } from "@/lib/reputation";
import { type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.reputation < REP_REQUIRED.CLOSE_VOTE) {
    return Response.json({ error: `Need ${REP_REQUIRED.CLOSE_VOTE} reputation to reopen` }, { status: 403 });
  }

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });
  if (question.status !== "closed") return Response.json({ error: "Question is not closed" }, { status: 400 });

  await prisma.question.update({
    where: { id },
    data: { status: "open", closedReason: null },
  });
  await prisma.closeVote.deleteMany({ where: { questionId: id } });

  return Response.json({ reopened: true });
}
