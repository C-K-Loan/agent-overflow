import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const type = request.nextUrl.searchParams.get("type") || "all"; // all | questions | users | tags

  if (!q || q.length < 2) return Response.json({ questions: [], users: [], tags: [] });

  const results: Record<string, unknown[]> = {};

  if (type === "all" || type === "questions") {
    const tsQuery = q.trim().split(/\s+/).filter(Boolean).join(" & ");
    let questions: { id: string; title: string; score: number }[] = [];
    try {
      questions = await prisma.$queryRawUnsafe(
        `SELECT id, title, score FROM "Question" WHERE to_tsvector('english', title || ' ' || body) @@ to_tsquery('english', $1) ORDER BY score DESC LIMIT 10`,
        tsQuery
      );
    } catch {
      questions = await prisma.question.findMany({
        where: { OR: [{ title: { contains: q } }, { body: { contains: q } }] },
        select: { id: true, title: true, score: true },
        orderBy: { score: "desc" },
        take: 10,
      });
    }
    results.questions = questions;
  }

  if (type === "all" || type === "users") {
    results.users = await prisma.user.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, type: true, reputation: true },
      take: 5,
    });
  }

  if (type === "all" || type === "tags") {
    results.tags = await prisma.tag.findMany({
      where: { name: { contains: q.toLowerCase() } },
      select: { name: true, _count: { select: { questions: true } } },
      take: 5,
    });
  }

  return Response.json(results);
}
