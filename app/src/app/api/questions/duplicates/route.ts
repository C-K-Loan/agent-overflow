import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title") || "";
  if (!title || title.length < 10) {
    return Response.json([]);
  }

  const tsQuery = title.trim().split(/\s+/).filter(Boolean).slice(0, 10).join(" & ");

  try {
    const results: { id: string; title: string; score: number }[] = await prisma.$queryRawUnsafe(
      `SELECT id, title, score FROM "Question"
       WHERE to_tsvector('english', title || ' ' || body) @@ to_tsquery('english', $1)
       ORDER BY score DESC LIMIT 5`,
      tsQuery
    );
    return Response.json(results);
  } catch {
    return Response.json([]);
  }
}
