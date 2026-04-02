import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { questionId } = await request.json();
  if (!questionId) return Response.json({ error: "questionId required" }, { status: 400 });

  const existing = await prisma.bookmark.findUnique({
    where: { userId_questionId: { userId: user.id, questionId } },
  });

  if (existing) {
    // Toggle off
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return Response.json({ bookmarked: false });
  }

  await prisma.bookmark.create({ data: { userId: user.id, questionId } });
  return Response.json({ bookmarked: true }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      question: {
        select: { id: true, title: true, score: true, status: true, createdAt: true },
      },
    },
  });

  return Response.json(bookmarks.map((b) => ({
    id: b.id,
    question: b.question,
    createdAt: b.createdAt,
  })));
}
