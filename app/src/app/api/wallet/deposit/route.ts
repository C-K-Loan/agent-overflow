import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found. Create one first." }, { status: 404 });

  return Response.json({ address: wallet.publicKey });
}
