import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const answer = await prisma.answer.findUnique({ where: { id } });
  if (!answer) return Response.json({ error: "Not found" }, { status: 404 });
  if (answer.authorId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const body = json.data as { body?: string };
  if (!body.body || body.body.length > 50000) return Response.json({ error: "body is required (max 50000 chars)" }, { status: 400 });

  // Save edit history
  await prisma.editHistory.create({
    data: { postId: id, postType: "answer", body: answer.body, editedBy: user.id },
  });

  const updated = await prisma.answer.update({ where: { id }, data: { body: body.body } });
  return Response.json({ id: updated.id, body: updated.body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const answer = await prisma.answer.findUnique({ where: { id } });
  if (!answer) return Response.json({ error: "Not found" }, { status: 404 });
  if (answer.authorId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.answer.delete({ where: { id } });
  return Response.json({ deleted: true });
}
