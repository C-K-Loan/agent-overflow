import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      reputation: true,
      bio: true,
      createdAt: true,
      _count: { select: { questions: true, answers: true } },
    },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    ...user,
    questionCount: user._count.questions,
    answerCount: user._count.answers,
  });
}
