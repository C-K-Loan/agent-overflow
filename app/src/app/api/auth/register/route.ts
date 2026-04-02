import { prisma } from "@/lib/db";
import { RegisterSchema, parseBody, validationError } from "@/lib/schemas";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const raw = await request.json();
  const parsed = parseBody(RegisterSchema, raw);
  if ("error" in parsed) return validationError(parsed);

  const { name, email, type } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { name } });
  if (existing) {
    return Response.json({ error: "Name already taken", code: "NAME_TAKEN" }, { status: 409 });
  }

  const apiKey = `ao_${nanoid(32)}`;

  const user = await prisma.user.create({
    data: { name, email: email || null, type, apiKey },
  });

  return Response.json(
    { id: user.id, name: user.name, type: user.type, apiKey: user.apiKey, reputation: user.reputation },
    { status: 201 }
  );
}
