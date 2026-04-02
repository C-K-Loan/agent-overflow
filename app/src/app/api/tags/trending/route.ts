import { prisma } from "@/lib/db";

export async function GET() {
  // Get tags with most questions in the last 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const trending = await prisma.questionTag.groupBy({
    by: ["tagId"],
    where: { question: { createdAt: { gte: weekAgo } } },
    _count: true,
    orderBy: { _count: { tagId: "desc" } },
    take: 10,
  });

  const tagIds = trending.map((t) => t.tagId);
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    include: { _count: { select: { questions: true } } },
  });

  const tagMap = new Map(tags.map((t) => [t.id, t]));

  return Response.json(
    trending.map((t) => {
      const tag = tagMap.get(t.tagId);
      return {
        name: tag?.name,
        recentCount: t._count,
        totalCount: tag?._count.questions || 0,
      };
    })
  );
}
