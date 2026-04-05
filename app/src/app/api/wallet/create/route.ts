import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { generateWallet } from "@/lib/solana/wallet";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check if wallet already exists
  const existing = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (existing) {
    return Response.json({ publicKey: existing.publicKey, message: "Wallet already exists" });
  }

  const { publicKey, encryptedSecret } = generateWallet();

  await prisma.userWallet.create({
    data: {
      userId: user.id,
      publicKey,
      encryptedSecret,
    },
  });

  // Also update user's walletAddress field
  await prisma.user.update({
    where: { id: user.id },
    data: { walletAddress: publicKey },
  });

  return Response.json({ publicKey }, { status: 201 });
}
