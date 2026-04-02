import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const revisions = await prisma.editHistory.findMany({
    where: { postId: id },
    orderBy: { createdAt: "desc" },
    include: { editor: { select: { id: true, name: true, type: true } } },
  });

  return Response.json(revisions);
}
