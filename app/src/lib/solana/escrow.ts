import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";
import {
  ESCROW_PROGRAM_ID,
  BOUNTY_SEED,
  VAULT_SEED,
  FEE_VAULT_SEED,
  COMMIT_SEED,
  USDC_MINT,
} from "./constants";

// ===== PDA Derivation =====

export function findBountyPda(questionIdHash: Buffer, asker: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BOUNTY_SEED, questionIdHash, asker.toBuffer()],
    ESCROW_PROGRAM_ID
  );
}

export function findVaultPda(bounty: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, bounty.toBuffer()],
    ESCROW_PROGRAM_ID
  );
}

export function findFeeVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED],
    ESCROW_PROGRAM_ID
  );
}

export function findCommitPda(bounty: PublicKey, committer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [COMMIT_SEED, bounty.toBuffer(), committer.toBuffer()],
    ESCROW_PROGRAM_ID
  );
}

/** Hash a question ID string to [u8; 32] */
export function hashQuestionId(questionId: string): Buffer {
  return createHash("sha256").update(questionId).digest();
}

// ===== Instruction Discriminators (precomputed) =====

const DISC = {
  createBounty: Buffer.from([122, 90, 14, 143, 8, 125, 200, 2]),
  fundBounty: Buffer.from([36, 148, 139, 239, 172, 37, 58, 255]),
  submitAnswer: Buffer.from([221, 73, 184, 157, 1, 150, 231, 48]),
  commitAnswer: Buffer.from([119, 52, 56, 79, 116, 29, 97, 31]),
  revealAnswer: Buffer.from([238, 203, 43, 175, 46, 127, 5, 50]),
  refund: Buffer.from([2, 96, 183, 251, 63, 208, 46, 46]),
  claimFees: Buffer.from([82, 251, 233, 156, 12, 52, 184, 202]),
  initFeeVault: Buffer.from([141, 17, 88, 209, 137, 84, 89, 235]),
};

// ===== Borsh Encoding Helpers =====

function encodeString(s: string): Buffer {
  const strBuf = Buffer.from(s, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(strBuf.length);
  return Buffer.concat([lenBuf, strBuf]);
}

function encodeBytes(b: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(b.length);
  return Buffer.concat([lenBuf, b]);
}

function encodeU64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

function encodeI64(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(n);
  return buf;
}

function encodeU8(n: number): Buffer {
  return Buffer.from([n]);
}

// ===== Transaction Builders =====

/** Build create_bounty instruction */
export function buildCreateBountyIx(params: {
  asker: PublicKey;
  askerAta: PublicKey;
  questionIdHash: Buffer;
  amount: bigint;
  verifierType: number;
  verifierConfig: Buffer;
  deadline: bigint;
}): TransactionInstruction {
  const [bountyPda] = findBountyPda(params.questionIdHash, params.asker);
  const [vaultPda] = findVaultPda(bountyPda);

  const data = Buffer.concat([
    DISC.createBounty,
    params.questionIdHash,           // [u8; 32]
    encodeU64(params.amount),        // u64
    encodeU8(params.verifierType),   // u8
    encodeBytes(params.verifierConfig), // bytes (Vec<u8>)
    encodeI64(params.deadline),      // i64
  ]);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.asker, isSigner: true, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: params.askerAta, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/** Build fund_bounty instruction */
export function buildFundBountyIx(params: {
  asker: PublicKey;
  askerAta: PublicKey;
  bountyPda: PublicKey;
}): TransactionInstruction {
  const [vaultPda] = findVaultPda(params.bountyPda);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.asker, isSigner: true, isWritable: true },
      { pubkey: params.bountyPda, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: params.askerAta, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: DISC.fundBounty,
  });
}

/** Build submit_answer instruction */
export function buildSubmitAnswerIx(params: {
  answerer: PublicKey;
  answererAta: PublicKey;
  bountyPda: PublicKey;
  platformFeeAccount: PublicKey;  // platform wallet's ATA for the bounty's USDC mint
}): { ix: (answer: string) => TransactionInstruction } {
  const [vaultPda] = findVaultPda(params.bountyPda);

  return {
    ix: (answer: string) => {
      const data = Buffer.concat([DISC.submitAnswer, encodeString(answer)]);
      return new TransactionInstruction({
        programId: ESCROW_PROGRAM_ID,
        keys: [
          { pubkey: params.answerer,           isSigner: true,  isWritable: true  },
          { pubkey: params.bountyPda,          isSigner: false, isWritable: true  },
          { pubkey: vaultPda,                  isSigner: false, isWritable: true  },
          { pubkey: params.answererAta,        isSigner: false, isWritable: true  },
          { pubkey: params.platformFeeAccount, isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROGRAM_ID,          isSigner: false, isWritable: false },
        ],
        data,
      });
    },
  };
}

/** Build refund instruction */
export function buildRefundIx(params: {
  asker: PublicKey;
  askerAta: PublicKey;
  bountyPda: PublicKey;
}): TransactionInstruction {
  const [vaultPda] = findVaultPda(params.bountyPda);

  return new TransactionInstruction({
    programId: ESCROW_PROGRAM_ID,
    keys: [
      { pubkey: params.asker, isSigner: true, isWritable: true },
      { pubkey: params.bountyPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: params.askerAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: DISC.refund,
  });
}
