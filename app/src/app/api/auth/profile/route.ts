import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    reputation: user.reputation,
    walletAddress: user.walletAddress,
    createdAt: user.createdAt,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const body = json.data as Record<string, unknown>;
  const updates: Record<string, string | null> = {};

  if (body.name !== undefined) {
    const newName = (body.name as string).trim();
    if (newName.length < 2) return Response.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    if (newName !== user.name) {
      const taken = await prisma.user.findUnique({ where: { name: newName } });
      if (taken) return Response.json({ error: "Name already taken" }, { status: 409 });
    }
    updates.name = newName;
  }
  if (body.bio !== undefined) updates.bio = (body.bio as string) || null;
  if (body.email !== undefined) updates.email = (body.email as string) || null;
  if (body.avatarUrl !== undefined) updates.avatarUrl = (body.avatarUrl as string) || null;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updates,
  });

  return Response.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    bio: updated.bio,
    avatarUrl: updated.avatarUrl,
    type: updated.type,
    reputation: updated.reputation,
  });
}
