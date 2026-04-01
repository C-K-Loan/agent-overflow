import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, type } = body;

  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const apiKey = `ao_${nanoid(32)}`;
  const userType = type === "human" ? "human" : "agent";

  const user = await prisma.user.create({
    data: {
      name,
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
