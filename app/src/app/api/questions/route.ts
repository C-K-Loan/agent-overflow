import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { AskQuestionSchema, parseBody, validationError } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const sort = searchParams.get("sort") || "newest";
  const q = searchParams.get("q") || "";
  const tag = searchParams.get("tag") || "";

  const where: Record<string, unknown> = {};

  // Full-text search using Postgres tsvector when query is provided
  let ftsIds: string[] | null = null;
  if (q) {
    const tsQuery = q.trim().split(/\s+/).filter(Boolean).join(" & ");
    try {
      const results: { id: string }[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Question" WHERE to_tsvector('english', title || ' ' || body) @@ to_tsquery('english', $1) LIMIT 100`,
        tsQuery
      );
      ftsIds = results.map((r) => r.id);
    } catch {
      // Fallback to LIKE if tsquery fails (e.g. special chars)
      ftsIds = null;
    }
    if (ftsIds !== null) {
      where.id = { in: ftsIds };
    } else {
      where.OR = [
        { title: { contains: q } },
        { body: { contains: q } },
      ];
    }
  }

  if (tag) {
    where.tags = { some: { tag: { name: tag } } };
  }

  const orderBy =
    sort === "votes" ? { score: "desc" as const } :
    sort === "active" ? { updatedAt: "desc" as const } :
    sort === "unanswered" ? { createdAt: "desc" as const } :
    { createdAt: "desc" as const };

  const extraWhere = sort === "unanswered" ? { answers: { none: {} } } : {};

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where: { ...where, ...extraWhere },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true, reputation: true, type: true } },
        tags: { include: { tag: true } },
        _count: { select: { answers: true, comments: true } },
      },
    }),
    prisma.question.count({ where: { ...where, ...extraWhere } }),
  ]);

  return Response.json({
    questions: questions.map((q) => ({
      id: q.id,
      title: q.title,
      body: q.body.slice(0, 200),
      author: q.author,
      tags: q.tags.map((t) => t.tag.name),
      score: q.score,
      views: q.views,
      answerCount: q._count.answers,
      status: q.status,
      createdAt: q.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = parseBody(AskQuestionSchema, raw);
  if ("error" in parsed) return validationError(parsed);

  const { title, body: qBody, tags } = parsed.data;
  const tagNames = tags.map((t) => t.toLowerCase().trim()).filter(Boolean);

  // Upsert tags
  const tagRecords = await Promise.all(
    tagNames.map((name: string) =>
      prisma.tag.upsert({
        where: { name: name.toLowerCase().trim() },
        create: { name: name.toLowerCase().trim() },
        update: {},
      })
    )
  );

  const question = await prisma.question.create({
    data: {
      title,
      body: qBody,
      authorId: user.id,
      tags: {
        create: tagRecords.map((t) => ({ tagId: t.id })),
      },
    },
    include: {
      author: { select: { id: true, name: true, reputation: true, type: true } },
      tags: { include: { tag: true } },
    },
  });

  return Response.json(
    {
      id: question.id,
      title: question.title,
      body: question.body,
      author: question.author,
      tags: question.tags.map((t) => t.tag.name),
      score: question.score,
      views: question.views,
      status: question.status,
      createdAt: question.createdAt,
    },
    { status: 201 }
  );
}
