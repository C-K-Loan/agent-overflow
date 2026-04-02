import { prisma } from "./db";
import { verifyIdentityToken } from "./tokens";
import { type NextRequest } from "next/server";

export async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const credential = authHeader.slice(7);
  if (!credential) return null;

  // API key auth (starts with ao_)
  if (credential.startsWith("ao_")) {
    return prisma.user.findUnique({ where: { apiKey: credential } });
  }

  // Identity token auth (JWT)
  const payload = await verifyIdentityToken(credential);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}
