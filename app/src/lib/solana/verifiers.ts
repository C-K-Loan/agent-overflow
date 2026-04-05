import { createHash } from "crypto";
import { FIXED_POINT_SCALE } from "./constants";

/** Verifier type IDs (must match Rust program) */
export const VERIFIER_TYPES = {
  exact_string: 0,
  exact_number: 1,
  numeric_tolerance: 2,
  numeric_range: 3,
  multi_numeric_tolerance: 4,
} as const;

export type VerifierTypeName = keyof typeof VERIFIER_TYPES;

/** Convert human-readable API config to Borsh-serialized bytes for on-chain storage */
export function serializeVerifierConfig(
  type: VerifierTypeName,
  config: Record<string, unknown>
): Buffer {
  switch (type) {
    case "exact_string": {
      // Config: { answerHash: "hex string" } — 32 bytes
      const hash = config.answerHash as string;
      if (!hash || hash.length !== 64) {
        throw new Error("answerHash must be 64-char hex SHA256");
      }
      return Buffer.from(hash, "hex");
    }

    case "exact_number": {
      // Config: { target: number } — 8 bytes i64 LE
      const buf = Buffer.alloc(8);
      buf.writeBigInt64LE(BigInt(config.target as number));
      return buf;
    }

    case "numeric_tolerance": {
      // Config: { target: number, epsilon: number } — 16 bytes
      const buf = Buffer.alloc(16);
      buf.writeBigInt64LE(toFixedPoint(config.target as number), 0);
      buf.writeBigUInt64LE(toFixedPointU(config.epsilon as number), 8);
      return buf;
    }

    case "numeric_range": {
      // Config: { min: number, max: number } — 16 bytes
      const buf = Buffer.alloc(16);
      buf.writeBigInt64LE(toFixedPoint(config.min as number), 0);
      buf.writeBigInt64LE(toFixedPoint(config.max as number), 8);
      return buf;
    }

    case "multi_numeric_tolerance": {
      // Config: { targets: [{ key, value, epsilon }] }
      const targets = config.targets as Array<{
        key: string;
        value: number;
        epsilon: number;
      }>;
      if (!targets || targets.length === 0 || targets.length > 16) {
        throw new Error("targets must have 1-16 entries");
      }
      const parts: Buffer[] = [Buffer.from([targets.length])];
      for (const t of targets) {
        const keyBuf = Buffer.from(t.key, "utf8");
        parts.push(Buffer.from([keyBuf.length]));
        parts.push(keyBuf);
        const valBuf = Buffer.alloc(16);
        valBuf.writeBigInt64LE(toFixedPoint(t.value), 0);
        valBuf.writeBigUInt64LE(toFixedPointU(t.epsilon), 8);
        parts.push(valBuf);
      }
      return Buffer.concat(parts);
    }

    default:
      throw new Error(`Unknown verifier type: ${type}`);
  }
}

/** Compute SHA256 hash of an answer (for exact_string config) */
export function hashAnswer(answer: string): string {
  return createHash("sha256").update(answer).digest("hex");
}

/** Convert float to fixed-point i64 (6 decimal places) */
function toFixedPoint(value: number): bigint {
  return BigInt(Math.round(value * FIXED_POINT_SCALE));
}

/** Convert float to fixed-point u64 (6 decimal places, unsigned) */
function toFixedPointU(value: number): bigint {
  return BigInt(Math.round(Math.abs(value) * FIXED_POINT_SCALE));
}

/** Convert USDC amount (float like 100.50) to native units (bigint) */
export function usdcToNative(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

/** Convert USDC native units (bigint) to float */
export function nativeToUsdc(amount: bigint): number {
  return Number(amount) / 1_000_000;
}

/** Verifier type metadata for the /verifiers endpoint */
export const VERIFIER_REGISTRY = [
  {
    type: "exact_string",
    name: "Exact String Match (SHA256)",
    description:
      "Submitted answer is hashed with SHA256 and compared to the stored hash. Answer never stored on-chain.",
    configSchema: {
      type: "object",
      required: ["answerHash"],
      properties: {
        answerHash: {
          type: "string",
          description: "64-char hex SHA256 hash of the correct answer",
        },
      },
    },
    answerFormat: "Plaintext string (will be hashed on-chain)",
    example: {
      config: { answerHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
      correctAnswer: "hello",
    },
  },
  {
    type: "exact_number",
    name: "Exact Number Match",
    description: "Submitted answer must exactly equal the target integer.",
    configSchema: {
      type: "object",
      required: ["target"],
      properties: {
        target: { type: "number", description: "The exact correct answer (integer)" },
      },
    },
    answerFormat: "Integer as string, e.g. \"42\"",
    example: { config: { target: 42 }, correctAnswer: "42" },
  },
  {
    type: "numeric_tolerance",
    name: "Numeric Tolerance",
    description: "Answer must be within epsilon of the target: |answer - target| <= epsilon.",
    configSchema: {
      type: "object",
      required: ["target", "epsilon"],
      properties: {
        target: { type: "number", description: "Target value" },
        epsilon: { type: "number", description: "Maximum allowed deviation" },
      },
    },
    answerFormat: "Fixed-point number as string, e.g. \"3141590\" for 3.14159",
    example: { config: { target: 3.14159, epsilon: 0.001 }, correctAnswer: "3141590" },
  },
  {
    type: "numeric_range",
    name: "Numeric Range",
    description: "Answer must be within [min, max] inclusive.",
    configSchema: {
      type: "object",
      required: ["min", "max"],
      properties: {
        min: { type: "number", description: "Minimum value (inclusive)" },
        max: { type: "number", description: "Maximum value (inclusive)" },
      },
    },
    answerFormat: "Fixed-point number as string",
    example: { config: { min: 10, max: 100 }, correctAnswer: "50" },
  },
  {
    type: "multi_numeric_tolerance",
    name: "Multi-Variable Tolerance",
    description:
      "Multiple named variables, each checked within its own tolerance. All must pass.",
    configSchema: {
      type: "object",
      required: ["targets"],
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            required: ["key", "value", "epsilon"],
            properties: {
              key: { type: "string" },
              value: { type: "number" },
              epsilon: { type: "number" },
            },
          },
        },
      },
    },
    answerFormat: "key1=value1,key2=value2 (fixed-point values)",
    example: {
      config: {
        targets: [
          { key: "u_0", value: 1.0, epsilon: 0.001 },
          { key: "u_1", value: 0.5, epsilon: 0.01 },
        ],
      },
      correctAnswer: "u_0=1000200,u_1=499000",
    },
  },
];
