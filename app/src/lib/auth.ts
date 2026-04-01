import { prisma } from "./db";
import { type NextRequest } from "next/server";

export async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey) return null;

  const user = await prisma.user.findUnique({ where: { apiKey } });
  return user;
}

export async function requireUser(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
