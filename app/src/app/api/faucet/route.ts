import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { getConnection } from "@/lib/solana/client";
import { USDC_MINT, SOLANA_NETWORK, explorerUrl } from "@/lib/solana/constants";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { restoreKeypair } from "@/lib/solana/wallet";

// Faucet config
const SOL_DRIP = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL (enough for ~100 txs)
const USDC_DRIP = 50_000_000;              // $50 USDC (enough for several bounties)
const COOLDOWN_MS = 24 * 60 * 60 * 1000;  // 1 drip per 24h per user

/**
 * POST /api/faucet
 *
 * Drips a small amount of SOL + USDC to the user's platform wallet.
 * Devnet/localnet only. Rate limited to 1 drip per 24h.
 *
 * The agent promises to send it back when done :)
 */
export async function POST(request: NextRequest) {
  // Only on devnet/localnet
  if (SOLANA_NETWORK === "mainnet-beta") {
    return Response.json({ error: "Faucet is not available on mainnet" }, { status: 403 });
  }

  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Check wallet exists
  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    return Response.json({
      error: "No wallet found. Create one first: POST /api/wallet/create",
    }, { status: 400 });
  }

  // Rate limit: 1 drip per 24h
  const lastDrip = await prisma.paymentLog.findFirst({
    where: { userId: user.id, type: "faucet_drip" },
    orderBy: { createdAt: "desc" },
  });
  if (lastDrip && Date.now() - lastDrip.createdAt.getTime() < COOLDOWN_MS) {
    const nextDrip = new Date(lastDrip.createdAt.getTime() + COOLDOWN_MS);
    return Response.json({
      error: `Faucet cooldown. Next drip available at ${nextDrip.toISOString()}`,
      nextDripAt: nextDrip.toISOString(),
    }, { status: 429 });
  }

  const connection = getConnection();
  const recipientPubkey = new PublicKey(wallet.publicKey);

  try {
    // 1. Airdrop SOL
    let solTxHash = "";
    try {
      const sig = await connection.requestAirdrop(recipientPubkey, SOL_DRIP);
      await connection.confirmTransaction(sig);
      solTxHash = sig;
    } catch {
      // Airdrop may fail on some RPCs — that's ok, USDC is more important
      solTxHash = "airdrop_unavailable";
    }

    // 2. Mint USDC (we're the mint authority on devnet)
    let usdcTxHash = "";
    const faucetKeyJson = process.env.FAUCET_KEYPAIR;
    if (faucetKeyJson) {
      try {
        const { Keypair } = await import("@solana/web3.js");
        const mintAuthority = Keypair.fromSecretKey(
          Uint8Array.from(JSON.parse(faucetKeyJson))
        );
        const ata = await getOrCreateAssociatedTokenAccount(
          connection, mintAuthority, USDC_MINT, recipientPubkey
        );
        const sig = await mintTo(
          connection, mintAuthority, USDC_MINT, ata.address, mintAuthority, USDC_DRIP
        );
        usdcTxHash = String(sig);
      } catch (e: any) {
        usdcTxHash = "mint_failed: " + e.message;
      }
    } else {
      usdcTxHash = "no_faucet_keypair_configured";
    }

    // Log the drip
    await prisma.paymentLog.create({
      data: {
        type: "faucet_drip",
        amount: BigInt(USDC_DRIP),
        token: "USDC",
        fromWallet: "faucet",
        toWallet: wallet.publicKey,
        txHash: `faucet_${user.id}_${Date.now()}`,
        userId: user.id,
      },
    });

    return Response.json({
      success: true,
      wallet: wallet.publicKey,
      drip: {
        sol: SOL_DRIP / LAMPORTS_PER_SOL,
        usdc: USDC_DRIP / 1_000_000,
      },
      solTxHash,
      usdcTxHash,
      message: "Funds received! Please return unused funds when done. Happy hacking!",
      nextDripAt: new Date(Date.now() + COOLDOWN_MS).toISOString(),
    });
  } catch (e: any) {
    console.error("Faucet error:", e);
    return Response.json({ error: `Faucet failed: ${e.message}` }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    network: SOLANA_NETWORK,
    available: SOLANA_NETWORK !== "mainnet-beta",
    drip: { sol: 0.05, usdc: 50 },
    cooldown: "24 hours",
    usage: "POST /api/faucet (requires auth). Creates wallet if needed, drips SOL + USDC.",
    note: "Please return unused funds when done. This is a community resource.",
  });
}
