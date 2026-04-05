/**
 * Fund local test wallets with SOL + USDC on the local validator.
 * Run AFTER creating wallets via the API.
 *
 * Usage: npx ts-node scripts/fund-local-wallets.ts <questioner_pubkey> <answerer_pubkey>
 */
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";

const RPC = "http://127.0.0.1:8899";

async function main() {
  const [, , qPubkeyStr, aPubkeyStr] = process.argv;
  if (!qPubkeyStr || !aPubkeyStr) {
    console.error("Usage: npx ts-node fund-local-wallets.ts <questioner_pubkey> <answerer_pubkey>");
    process.exit(1);
  }

  const connection = new Connection(RPC, "confirmed");
  const qPubkey = new PublicKey(qPubkeyStr);
  const aPubkey = new PublicKey(aPubkeyStr);

  // Load local validator payer (has 500M SOL)
  const payerKeyfile = `${process.env.HOME}/.config/solana/devnet.json`;
  const payerSecret = JSON.parse(fs.readFileSync(payerKeyfile, "utf8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));
  console.log("Payer:", payer.publicKey.toBase58());

  // 1. Airdrop SOL to both wallets
  console.log("\n1. Airdropping SOL...");
  for (const [name, pubkey] of [["Questioner", qPubkey], ["Answerer", aPubkey]] as const) {
    const sig = await connection.requestAirdrop(pubkey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    const bal = await connection.getBalance(pubkey);
    console.log(`   ${name} (${pubkey.toBase58().slice(0, 8)}...): ${bal / LAMPORTS_PER_SOL} SOL`);
  }

  // 2. Create USDC-like mint (6 decimals)
  console.log("\n2. Creating USDC mint...");
  const usdcMint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log(`   USDC Mint: ${usdcMint.toBase58()}`);

  // 3. Create ATAs and mint USDC
  console.log("\n3. Minting USDC...");
  const qAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, qPubkey);
  await mintTo(connection, payer, usdcMint, qAta.address, payer, 1000_000_000); // $1000 USDC
  console.log(`   Questioner ATA: ${qAta.address.toBase58()} — $1000 USDC`);

  const aAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMint, aPubkey);
  await mintTo(connection, payer, usdcMint, aAta.address, payer, 100_000_000); // $100 USDC
  console.log(`   Answerer ATA: ${aAta.address.toBase58()} — $100 USDC`);

  // 4. Initialize the fee vault PDA
  console.log("\n4. Initializing fee vault...");
  const ESCROW_PROGRAM_ID = new PublicKey("3Cr9smqeF12BhzG3fWJVJ21V4WwmG2Vz3rRuLiPgzJGK");
  const [feeVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    ESCROW_PROGRAM_ID
  );
  console.log(`   Fee vault PDA: ${feeVaultPda.toBase58()}`);
  // The fee vault needs to be initialized via the program's init_fee_vault instruction
  // We'll handle this through Anchor

  console.log("\n=== SETUP COMPLETE ===");
  console.log(`\nUpdate your .env with:`);
  console.log(`SOLANA_RPC_URL=http://127.0.0.1:8899`);
  console.log(`SOLANA_NETWORK=localnet`);
  console.log(`USDC_MINT=${usdcMint.toBase58()}`);
  console.log(`ESCROW_PROGRAM_ID=3Cr9smqeF12BhzG3fWJVJ21V4WwmG2Vz3rRuLiPgzJGK`);
}

main().catch(console.error);
