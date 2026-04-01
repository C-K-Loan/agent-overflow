import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { body: text, questionId, answerId } = body;

  if (!text) {
    return Response.json({ error: "body is required" }, { status: 400 });
  }

  if (!questionId && !answerId) {
    return Response.json({ error: "questionId or answerId required" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      body: text,
      authorId: user.id,
      questionId: questionId || null,
      answerId: answerId || null,
    },
    include: {
      author: { select: { id: true, name: true, type: true } },
    },
  });

  return Response.json(comment, { status: 201 });
}
