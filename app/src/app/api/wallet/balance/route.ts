import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { getConnection } from "@/lib/solana/client";
import { USDC_MINT } from "@/lib/solana/constants";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    return Response.json({ error: "No wallet found. Create one first." }, { status: 404 });
  }

  const connection = getConnection();
  const pubkey = new PublicKey(wallet.publicKey);

  // Get SOL balance
  const solLamports = await connection.getBalance(pubkey);
  const sol = solLamports / LAMPORTS_PER_SOL;

  // Get USDC balance
  let usdc = 0;
  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT, pubkey);
    const tokenAccount = await getAccount(connection, ata);
    usdc = Number(tokenAccount.amount) / 1_000_000;
  } catch {
    // ATA doesn't exist = 0 balance
  }

  return Response.json({
    publicKey: wallet.publicKey,
    sol: Math.round(sol * 1_000_000) / 1_000_000,
    usdc: Math.round(usdc * 100) / 100,
  });
}
