import { Keypair } from "@solana/web3.js";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import { WALLET_ENCRYPTION_KEY } from "./constants";

function getKey(): Buffer {
  if (!WALLET_ENCRYPTION_KEY || WALLET_ENCRYPTION_KEY.length < 64) {
    throw new Error("WALLET_ENCRYPTION_KEY must be set (64-char hex = 32 bytes)");
  }
  return Buffer.from(WALLET_ENCRYPTION_KEY, "hex");
}

/** Encrypt a Solana secret key with AES-256-GCM */
export function encryptSecretKey(secretKey: Uint8Array): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secretKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt a Solana secret key from AES-256-GCM ciphertext */
export function decryptSecretKey(encrypted: string): Uint8Array {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(":");
  const key = getKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return new Uint8Array(decrypted);
}

/** Generate a new Solana keypair, return public key + encrypted secret */
export function generateWallet(): {
  publicKey: string;
  encryptedSecret: string;
} {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedSecret: encryptSecretKey(keypair.secretKey),
  };
}

/** Restore a Keypair from an encrypted secret */
export function restoreKeypair(encryptedSecret: string): Keypair {
  const secretKey = decryptSecretKey(encryptedSecret);
  return Keypair.fromSecretKey(secretKey);
}
