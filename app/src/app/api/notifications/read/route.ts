import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const { id, all } = json.data as { id?: string; all?: boolean };

  if (all) {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return Response.json({ marked: "all" });
  }

  if (id) {
    await prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { read: true },
    });
    return Response.json({ marked: id });
  }

  return Response.json({ error: "id or all:true required" }, { status: 400 });
}
