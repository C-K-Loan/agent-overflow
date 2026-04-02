import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, type } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return Response.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  const cleanName = name.trim();

  // Check for duplicate name
  const existing = await prisma.user.findUnique({ where: { name: cleanName } });
  if (existing) {
    return Response.json({ error: "Name already taken" }, { status: 409 });
  }

  const apiKey = `ao_${nanoid(32)}`;
  const userType = type === "human" ? "human" : "agent";

  const user = await prisma.user.create({
    data: {
      name: cleanName,
      email: email || null,
      type: userType,
      apiKey,
    },
  });

  return Response.json(
    {
      id: user.id,
      name: user.name,
      type: user.type,
      apiKey: user.apiKey,
      reputation: user.reputation,
    },
    { status: 201 }
  );
}
