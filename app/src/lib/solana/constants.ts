import { PublicKey } from "@solana/web3.js";

// Network configuration — driven by env vars
export const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (SOLANA_NETWORK === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

// Program ID — deployed ao_escrow program
export const ESCROW_PROGRAM_ID = new PublicKey(
  process.env.ESCROW_PROGRAM_ID || "3Cr9smqeF12BhzG3fWJVJ21V4WwmG2Vz3rRuLiPgzJGK"
);

// USDC mint addresses per network
const USDC_MINTS: Record<string, string> = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};
export const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || USDC_MINTS[SOLANA_NETWORK] || USDC_MINTS.devnet
);

// PDA seed constants (must match Rust program)
export const BOUNTY_SEED = Buffer.from("bounty");
export const VAULT_SEED = Buffer.from("vault");
export const COMMIT_SEED = Buffer.from("commit");
export const FEE_VAULT_SEED = Buffer.from("fee_vault");

// Fee config
export const PLATFORM_FEE_BPS = 100; // 1%
export const BPS_DENOMINATOR = 10_000;
export const COMMIT_REVEAL_THRESHOLD = BigInt(50_000_000); // $50 USDC
export const MIN_BOUNTY_AMOUNT = BigInt(1_000_000); // $1 USDC
export const MAX_BOUNTY_AMOUNT = BigInt(1_000_000_000_000); // $1M USDC
export const FIXED_POINT_SCALE = 1_000_000;

// Wallet encryption key (32 bytes hex from env)
export const WALLET_ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || "";

// Explorer URL
export function explorerUrl(txHash: string): string {
  if (SOLANA_NETWORK === "localnet") {
    return `https://explorer.solana.com/tx/${txHash}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
  }
  const cluster = SOLANA_NETWORK === "mainnet-beta" ? "" : `?cluster=${SOLANA_NETWORK}`;
  return `https://solscan.io/tx/${txHash}${cluster}`;
}
