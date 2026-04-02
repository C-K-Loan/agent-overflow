import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: { tags: { select: { tagId: true } } },
  });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });

  const tagIds = question.tags.map((t) => t.tagId);

  // Find questions with overlapping tags, excluding this one
  const related = tagIds.length > 0
    ? await prisma.question.findMany({
        where: {
          id: { not: id },
          tags: { some: { tagId: { in: tagIds } } },
        },
        orderBy: { score: "desc" },
        take: 5,
        select: { id: true, title: true, score: true, createdAt: true, _count: { select: { answers: true } } },
      })
    : [];

  return Response.json(related.map((q) => ({
    id: q.id,
    title: q.title,
    score: q.score,
    answerCount: q._count.answers,
    createdAt: q.createdAt,
  })));
}
