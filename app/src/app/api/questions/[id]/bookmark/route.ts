import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

// Convenience endpoint: toggle bookmark directly from question page
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: questionId } = await params;

  const existing = await prisma.bookmark.findUnique({
    where: { userId_questionId: { userId: user.id, questionId } },
  });

  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    return Response.json({ bookmarked: false });
  }

  await prisma.bookmark.create({ data: { userId: user.id, questionId } });
  return Response.json({ bookmarked: true }, { status: 201 });
}
