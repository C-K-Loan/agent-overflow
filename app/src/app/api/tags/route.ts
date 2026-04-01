import { prisma } from "@/lib/db";

export async function GET() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { questions: { _count: "desc" } },
    take: 100,
  });

  return Response.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      questionCount: t._count.questions,
    }))
  );
}
