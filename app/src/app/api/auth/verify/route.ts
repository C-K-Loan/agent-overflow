import { prisma } from "@/lib/db";
import { verifyIdentityToken } from "@/lib/tokens";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return Response.json({ error: "token required" }, { status: 400 });
  }

  const payload = await verifyIdentityToken(token);
  if (!payload) {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, type: true, reputation: true, bio: true },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({ valid: true, user });
}
