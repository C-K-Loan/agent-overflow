import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const unreadOnly = request.nextUrl.searchParams.get("unread") === "true";
  const limit = Math.min(50, parseInt(request.nextUrl.searchParams.get("limit") || "20"));

  const where: Record<string, unknown> = { userId: user.id };
  if (unreadOnly) where.read = false;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  return Response.json({
    notifications: notifications.map((n) => ({
      ...n,
      data: JSON.parse(n.data),
    })),
    unreadCount,
  });
}
