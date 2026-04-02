import { prisma } from "@/lib/db";
import { createIdentityToken } from "@/lib/tokens";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "API key required" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const user = await prisma.user.findUnique({ where: { apiKey } });
  if (!user) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  const token = await createIdentityToken(user.id, user.name, user.type);

  return Response.json({
    token,
    expiresIn: 3600,
    user: {
      id: user.id,
      name: user.name,
      type: user.type,
      reputation: user.reputation,
    },
  });
}
