import { prisma } from "@/lib/db";
import { RegisterSchema, parseBody, validationError, safeJson } from "@/lib/schemas";
import { generateWallet } from "@/lib/solana/wallet";
import { generateAlternatives } from "./suggestions";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const jsonResult = await safeJson(request);
  if (!jsonResult.ok) return jsonResult.response;
  const parsed = parseBody(RegisterSchema, jsonResult.data);
  if ("error" in parsed) return validationError(parsed);

  const { name, email, type } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { name } });
  if (existing) {
    const suggestions = generateAlternatives(name);
    return Response.json(
      { error: `Name '${name}' is already taken.`, suggestions, code: "NAME_TAKEN" },
      { status: 409 }
    );
  }

  const apiKey = `ao_${nanoid(32)}`;
  const { publicKey, encryptedSecret } = generateWallet();

  const user = await prisma.user.create({
    data: { name, email: email || null, type, apiKey, walletAddress: publicKey },
  });

  await prisma.userWallet.create({
    data: { userId: user.id, publicKey, encryptedSecret },
  });

  return Response.json(
    { id: user.id, name: user.name, type: user.type, apiKey: user.apiKey, reputation: user.reputation, walletAddress: publicKey },
    { status: 201 }
  );
}
