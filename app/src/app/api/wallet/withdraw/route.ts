import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { safeJson } from "@/lib/schemas";
import { type NextRequest } from "next/server";
import { getConnection } from "@/lib/solana/client";
import { USDC_MINT, explorerUrl } from "@/lib/solana/constants";
import { restoreKeypair } from "@/lib/solana/wallet";
import { usdcToNative, nativeToUsdc } from "@/lib/solana/verifiers";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const json = await safeJson(request);
  if (!json.ok) return json.response;
  const { destination, amount } = json.data as { destination?: string; amount?: number };

  if (!destination || !amount || amount <= 0) {
    return Response.json({ error: "destination (Solana address) and amount (USDC) required" }, { status: 400 });
  }


  let destPubkey: PublicKey;
  try {
    destPubkey = new PublicKey(destination);
  } catch {
    return Response.json({ error: "Invalid Solana address" }, { status: 400 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found" }, { status: 404 });

  const connection = getConnection();
  const sourcePubkey = new PublicKey(wallet.publicKey);
  const nativeAmount = usdcToNative(amount);

  // Check balance
  const sourceAta = await getAssociatedTokenAddress(USDC_MINT, sourcePubkey);
  try {
    const account = await getAccount(connection, sourceAta);
    if (account.amount < nativeAmount) {
      return Response.json({
        error: `Insufficient USDC balance. Have: $${nativeToUsdc(account.amount)}, need: $${amount}`,
      }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "No USDC token account found" }, { status: 400 });
  }

  const destAta = await getAssociatedTokenAddress(USDC_MINT, destPubkey);

  try {
    const keypair = restoreKeypair(wallet.encryptedSecret);

    const ix = createTransferInstruction(
      sourceAta,
      destAta,
      sourcePubkey,
      nativeAmount
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = sourcePubkey;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(keypair);

    const txHash = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature: txHash, blockhash, lastValidBlockHeight }, "confirmed");

    await prisma.paymentLog.create({
      data: {
        type: "withdrawal",
        amount: nativeAmount,
        token: "USDC",
        fromWallet: wallet.publicKey,
        toWallet: destination,
        txHash,
        userId: user.id,
      },
    });

    return Response.json({
      txHash,
      amount,
      destination,
      explorerUrl: explorerUrl(txHash),
    });
  } catch (e: any) {
    console.error("Withdrawal failed:", e);
    return Response.json({ error: `Withdrawal failed: ${e.message}` }, { status: 500 });
  }
}
