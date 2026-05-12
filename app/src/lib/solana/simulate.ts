import {
  Transaction,
  TransactionInstruction,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { getConnection } from "./client";

export interface SimulationResult {
  success: boolean;
  error?: string;
  logs?: string[];
}

/** Simulate a transaction without sending it. Free, no gas. */
export async function simulateTransaction(
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers?: Keypair[]
): Promise<SimulationResult> {
  const connection = getConnection();
  const tx = new Transaction();
  tx.feePayer = payer;

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  for (const ix of instructions) {
    tx.add(ix);
  }

  if (signers) {
    tx.sign(...signers);
  }

  const result = await connection.simulateTransaction(tx);

  if (result.value.err) {
    return {
      success: false,
      error: JSON.stringify(result.value.err),
      logs: result.value.logs || undefined,
    };
  }

  return { success: true, logs: result.value.logs || undefined };
}

/** Send a signed transaction and confirm it */
export async function sendAndConfirm(
  instructions: TransactionInstruction[],
  payer: Keypair,
  additionalSigners?: Keypair[]
): Promise<string> {
  const connection = getConnection();
  const tx = new Transaction();
  tx.feePayer = payer.publicKey;

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  for (const ix of instructions) {
    tx.add(ix);
  }

  const allSigners = [payer, ...(additionalSigners || [])];
  tx.sign(...allSigners);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });

  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return signature;
}
