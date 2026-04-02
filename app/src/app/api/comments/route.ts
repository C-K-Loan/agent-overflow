import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { REP_REQUIRED } from "@/lib/reputation";
import { CommentSchema, parseBody, validationError } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  if (user.reputation < REP_REQUIRED.COMMENT) {
    return Response.json({ error: `Need ${REP_REQUIRED.COMMENT} reputation to comment`, code: "INSUFFICIENT_REP" }, { status: 403 });
  }

  const raw = await request.json();
  const parsed = parseBody(CommentSchema, raw);
  if ("error" in parsed) return validationError(parsed);

  const { body, questionId, answerId } = parsed.data;

  const comment = await prisma.comment.create({
    data: {
      body,
      authorId: user.id,
      questionId: questionId || null,
      answerId: answerId || null,
    },
    include: { author: { select: { id: true, name: true, type: true } } },
  });

  return Response.json(comment, { status: 201 });
}
