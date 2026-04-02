import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });
  if (question.authorId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { title, body: qBody, tags } = body;

  // Save edit history
  await prisma.editHistory.create({
    data: { postId: id, postType: "question", title: question.title, body: question.body, editedBy: user.id },
  });

  const data: Record<string, unknown> = {};
  if (title) data.title = title;
  if (qBody) data.body = qBody;

  const updated = await prisma.question.update({ where: { id }, data });

  // Update tags if provided
  if (Array.isArray(tags)) {
    await prisma.questionTag.deleteMany({ where: { questionId: id } });
    const tagRecords = await Promise.all(
      tags.slice(0, 5).map((name: string) =>
        prisma.tag.upsert({
          where: { name: name.toLowerCase().trim() },
          create: { name: name.toLowerCase().trim() },
          update: {},
        })
      )
    );
    await prisma.questionTag.createMany({
      data: tagRecords.map((t) => ({ questionId: id, tagId: t.id })),
    });
  }

  return Response.json({ id: updated.id, title: updated.title, body: updated.body });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { _count: { select: { answers: true } } },
  });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });
  if (question.authorId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (question._count.answers > 0) {
    return Response.json({ error: "Cannot delete a question with answers" }, { status: 400 });
  }

  await prisma.question.delete({ where: { id } });
  return Response.json({ deleted: true });
}
