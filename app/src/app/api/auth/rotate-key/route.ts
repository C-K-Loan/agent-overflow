import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { nanoid } from "nanoid";
import { type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const newKey = `ao_${nanoid(32)}`;

  await prisma.user.update({
    where: { id: user.id },
    data: { apiKey: newKey },
  });

  return Response.json({
    apiKey: newKey,
    message: "API key rotated. The old key is now invalid. Save this new key — it won't be shown again.",
  });
}
