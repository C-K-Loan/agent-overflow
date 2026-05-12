/**
 * Private bounty funding via Cloak ZK SDK (@cloak.dev/sdk v0.1.6)
 *
 * Cloak is a ZK shielded-pool protocol on Solana using a UTXO model.
 * Current support: native SOL only (USDC/SPL private transfers not yet live).
 *
 * Flow for private bounty funding:
 *   1. depositToShieldPool  — shields SOL into the Cloak pool (deposit UTXO)
 *   2. withdrawFromShieldPool — withdraws shielded SOL to a recipient address
 *   3. shieldAndSend        — convenience: deposit then immediately withdraw to recipient
 *
 * All ZK proofs are generated client-side via snarkjs (downloaded once from S3).
 * Relay at https://api.cloak.ag pays Solana tx fees and submits proofs on-chain.
 *
 * Fees: 0.005 SOL fixed + 0.3% variable per deposit/withdraw.
 */

import {
  CLOAK_PROGRAM_ID,
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  partialWithdraw,
  generateUtxoKeypair,
  transact,
  calculateFeeBigint,
  MIN_DEPOSIT_LAMPORTS,
  type Utxo,
  type TransactResult,
} from "@cloak.dev/sdk";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "./constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLOAK_RELAY_URL = "https://api.cloak.ag";
const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositParams {
  /** Amount in lamports to shield. Must be >= 10_000_000 (0.01 SOL). */
  amountLamports: bigint;
  /** Keypair of the wallet funding the deposit. */
  depositorKeypair: Keypair;
}

export interface WithdrawParams {
  /** Output UTXOs from a prior deposit (TransactResult.outputUtxos). */
  inputUtxos: Utxo[];
  /** Solana address that will receive the withdrawn SOL. */
  recipient: PublicKey;
  /**
   * Amount in lamports to withdraw. If omitted, withdraws the full UTXO balance
   * (less protocol fees).
   */
  amountLamports?: bigint;
  /** The depositor keypair (needed to authorise the withdrawal proof). */
  depositorKeypair: Keypair;
  /**
   * Cached Merkle tree from the deposit result — pass this to skip relay
   * re-fetching when withdraw immediately follows deposit in the same flow.
   */
  cachedMerkleTree?: TransactResult["merkleTree"];
}

export interface ShieldAndSendParams {
  /** Amount in lamports to privately forward. */
  amountLamports: bigint;
  /** Keypair of the funding wallet. */
  depositorKeypair: Keypair;
  /** Final recipient of the privately-sent SOL. */
  recipient: PublicKey;
}

export interface CloakTransferResult {
  /** Deposit transaction signature. */
  depositSignature: string;
  /** Withdraw transaction signature (only present when withdraw step ran). */
  withdrawSignature?: string;
  /** Net SOL received by recipient after fees (lamports). */
  netAmountLamports: bigint;
  /** Protocol fee paid (lamports). */
  protocolFeeLamports: bigint;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}

/**
 * Shared TransactOptions for Node.js server-side usage (keypair signing).
 */
function baseOptions(depositorKeypair: Keypair, cachedMerkleTree?: TransactResult["merkleTree"]) {
  return {
    connection: getConnection(),
    programId: CLOAK_PROGRAM_ID,
    depositorKeypair,
    walletPublicKey: depositorKeypair.publicKey,
    relayUrl: CLOAK_RELAY_URL,
    cachedMerkleTree,
  };
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * Shield SOL into the Cloak pool.
 *
 * Builds a deposit UTXO, generates a ZK proof, and submits via the Cloak relay.
 * Returns the TransactResult including the output UTXOs needed for withdrawal.
 */
export async function depositToShieldPool(params: DepositParams): Promise<TransactResult> {
  const { amountLamports, depositorKeypair } = params;

  if (amountLamports < MIN_DEPOSIT_LAMPORTS) {
    throw new Error(
      `Minimum deposit is ${MIN_DEPOSIT_LAMPORTS} lamports (0.01 SOL). Got ${amountLamports}.`
    );
  }

  // Generate a fresh UTXO keypair — the private key must be stored securely
  // by the caller to enable future withdrawals.
  const ownerKeypair = await generateUtxoKeypair();
  const depositUtxo = await createUtxo(amountLamports, ownerKeypair, NATIVE_SOL_MINT);

  const result = await transact(
    {
      inputUtxos: [await createZeroUtxo(NATIVE_SOL_MINT), await createZeroUtxo(NATIVE_SOL_MINT)],
      outputUtxos: [depositUtxo, await createZeroUtxo(NATIVE_SOL_MINT)],
      externalAmount: amountLamports,
      depositor: depositorKeypair.publicKey,
    },
    baseOptions(depositorKeypair)
  );

  return result;
}

/**
 * Withdraw shielded SOL from the Cloak pool to a plain Solana address.
 *
 * Pass the outputUtxos from a prior depositToShieldPool call.
 * For full withdrawal use amountLamports=undefined; for partial specify an amount.
 */
export async function withdrawFromShieldPool(params: WithdrawParams): Promise<string> {
  const { inputUtxos, recipient, amountLamports, depositorKeypair, cachedMerkleTree } = params;
  const opts = baseOptions(depositorKeypair, cachedMerkleTree);

  if (amountLamports !== undefined) {
    const result = await partialWithdraw(inputUtxos, recipient, amountLamports, opts);
    return result.signature;
  } else {
    const result = await fullWithdraw(inputUtxos, recipient, opts);
    return result.signature;
  }
}

/**
 * Shield SOL and immediately privately forward it to a recipient.
 *
 * Combines deposit + full-withdraw in a single call. The intermediate shielded
 * UTXO breaks the on-chain link between sender and recipient.
 *
 * Note: This is a 2-transaction flow (deposit tx + withdraw tx).
 * Both go through the Cloak relay; the relay pays Solana tx fees.
 */
export async function shieldAndSend(params: ShieldAndSendParams): Promise<CloakTransferResult> {
  const { amountLamports, depositorKeypair, recipient } = params;

  // Calculate fee upfront so callers know the cost
  const feeLamports = calculateFeeBigint(amountLamports);
  const netAmount = amountLamports - feeLamports;

  // Step 1: deposit
  const depositResult = await depositToShieldPool({ amountLamports, depositorKeypair });

  // Step 2: withdraw to recipient using cached Merkle tree from deposit
  const withdrawSig = await withdrawFromShieldPool({
    inputUtxos: depositResult.outputUtxos,
    recipient,
    depositorKeypair,
    cachedMerkleTree: depositResult.merkleTree,
  });

  return {
    depositSignature: depositResult.signature,
    withdrawSignature: withdrawSig,
    netAmountLamports: netAmount,
    protocolFeeLamports: feeLamports,
  };
}

// ---------------------------------------------------------------------------
// Utility: estimate fees before committing
// ---------------------------------------------------------------------------

/**
 * Estimate the Cloak protocol fee for a given SOL amount.
 * Formula: 0.005 SOL fixed + 0.3% variable.
 */
export function estimateCloakFee(amountLamports: bigint): {
  feeLamports: bigint;
  netLamports: bigint;
  feeSol: string;
  netSol: string;
} {
  const feeLamports = calculateFeeBigint(amountLamports);
  const netLamports = amountLamports - feeLamports;
  return {
    feeLamports,
    netLamports,
    feeSol: (Number(feeLamports) / Number(LAMPORTS_PER_SOL)).toFixed(6),
    netSol: (Number(netLamports) / Number(LAMPORTS_PER_SOL)).toFixed(6),
  };
}
