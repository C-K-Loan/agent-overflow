import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const tag = await prisma.tag.findUnique({
    where: { name },
    include: { _count: { select: { questions: true } } },
  });
  if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });

  return Response.json({
    id: tag.id,
    name: tag.name,
    description: tag.description,
    wikiBody: tag.wikiBody,
    questionCount: tag._count.questions,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const body = json.data as { description?: string; wikiBody?: string };

  const tag = await prisma.tag.findUnique({ where: { name } });
  if (!tag) return Response.json({ error: "Tag not found" }, { status: 404 });

  const data: Record<string, string> = {};
  if (body.description) data.description = body.description;
  if (body.wikiBody) data.wikiBody = body.wikiBody;

  const updated = await prisma.tag.update({ where: { name }, data });
  return Response.json(updated);
}
