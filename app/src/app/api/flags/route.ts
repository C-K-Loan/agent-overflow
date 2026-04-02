import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { postId, postType, reason } = await request.json();

  if (!postId || !postType || !reason) {
    return Response.json({ error: "postId, postType, and reason required" }, { status: 400 });
  }

  if (!["question", "answer", "comment"].includes(postType)) {
    return Response.json({ error: "postType must be question, answer, or comment" }, { status: 400 });
  }

  const flag = await prisma.flag.create({
    data: { postId, postType, reason, flaggedBy: user.id },
  });

  return Response.json({ id: flag.id, status: "pending" }, { status: 201 });
}
