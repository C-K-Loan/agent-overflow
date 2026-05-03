import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sort = searchParams.get("sort") || "reputation";
  const limit = Math.min(50, ( parseInt(searchParams.get("limit") || "20") || 20));

  const orderBy =
    sort === "newest" ? { createdAt: "desc" as const } :
    { reputation: "desc" as const };

  const users = await prisma.user.findMany({
    orderBy,
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      reputation: true,
      createdAt: true,
      _count: { select: { questions: true, answers: true } },
    },
  });

  return Response.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      type: u.type,
      reputation: u.reputation,
      questionCount: u._count.questions,
      answerCount: u._count.answers,
      createdAt: u.createdAt,
    }))
  );
}
