import { createHash } from "crypto";
import { FIXED_POINT_SCALE } from "./constants";

/** Verifier type IDs (must match Rust program).
 *  Types 5-7 are verified in TypeScript; on-chain they use type 255 (pass-through).
 *  This allows new verifiers without a program redeploy.
 */
export const VERIFIER_TYPES = {
  exact_string: 0,
  exact_number: 1,
  numeric_tolerance: 2,
  numeric_range: 3,
  multi_numeric_tolerance: 4,
  hash_preimage: 5,
  sat: 6,
  graph_coloring: 7,
  wasm_exec: 8,
} as const;

/** Verifier types handled purely in TypeScript (on-chain type = 255 pass-through) */
export const TS_ONLY_VERIFIERS = new Set([5, 6, 7, 8]);

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

    case "hash_preimage": {
      // Config: { targetHash: "hex" } — store 32-byte hash
      const hex = config.targetHash as string;
      if (!hex || hex.length !== 64) throw new Error("targetHash must be 64-char hex SHA256");
      return Buffer.from(hex, "hex");
    }

    case "sat": {
      // Config: { numVars, clauses: number[][] } — compact binary
      const numVars = config.numVars as number;
      const clauses = config.clauses as number[][];
      if (!numVars || numVars < 1 || numVars > 20) throw new Error("numVars must be 1-20");
      if (!clauses || clauses.length < 1 || clauses.length > 12) throw new Error("clauses must have 1-12 entries");
      const buf: number[] = [numVars, clauses.length];
      for (const clause of clauses) {
        if (clause.length < 1 || clause.length > 5) throw new Error("each clause must have 1-5 literals");
        buf.push(clause.length);
        for (const lit of clause) {
          if (lit === 0 || Math.abs(lit) > numVars) throw new Error(`literal ${lit} out of range`);
          buf.push(lit < 0 ? 256 + lit : lit); // i8 as u8
        }
      }
      if (buf.length > 64) throw new Error(`SAT config too large: ${buf.length} bytes (max 64)`);
      return Buffer.from(buf);
    }

    case "graph_coloring": {
      // Config: { numVertices, numColors, edges: [u,v][] } — compact binary
      const numVertices = config.numVertices as number;
      const numColors   = config.numColors as number;
      const edges       = config.edges as [number, number][];
      if (!numVertices || numVertices < 1 || numVertices > 15) throw new Error("numVertices must be 1-15");
      if (!numColors   || numColors < 1   || numColors > 8)   throw new Error("numColors must be 1-8");
      if (!edges || edges.length > 30) throw new Error("edges must have ≤30 entries");
      const buf: number[] = [numVertices, numColors, edges.length];
      for (const [u, v] of edges) {
        if (u >= numVertices || v >= numVertices) throw new Error(`edge [${u},${v}] out of range`);
        buf.push(u, v);
      }
      if (buf.length > 64) throw new Error(`graph_coloring config too large: ${buf.length} bytes (max 64)`);
      return Buffer.from(buf);
    }

    case "wasm_exec": {
      // Config: { wasmBase64: string, description: string }
      // On-chain we store a 32-byte SHA256 of the WASM binary as commitment
      const wasmBase64 = config.wasmBase64 as string;
      if (!wasmBase64) throw new Error("wasmBase64 required");
      const wasmBytes = Buffer.from(wasmBase64, "base64");
      if (wasmBytes.length > 500_000) throw new Error("WASM binary too large (max 500KB)");
      // Store SHA256 of binary as 32-byte on-chain commitment
      return createHash("sha256").update(wasmBytes).digest();
    }

    default:
      throw new Error(`Unknown verifier type: ${type}`);
  }
}

/** Compute SHA256 hash of an answer (for exact_string / hash_preimage config) */
export function hashAnswer(answer: string): string {
  return createHash("sha256").update(answer).digest("hex");
}

/**
 * TypeScript-side verification for types 5-8.
 * These mirror the Rust logic exactly so the behaviour is identical.
 * Returns null if correct, error string if wrong.
 */
export async function verifyInTypeScript(
  verifierType: number,
  configBuf: Buffer,
  solution: string,
  fullConfig?: Record<string, unknown>
): Promise<string | null> {
  try {
    switch (verifierType) {
      case 5: return verifyHashPreimage(configBuf, solution);
      case 6: return verifySat(configBuf, solution);
      case 7: return verifyGraphColoring(configBuf, solution);
      case 8: return verifyWasmExec(configBuf, solution, fullConfig);
      default: return null; // on-chain handles it
    }
  } catch (e: any) {
    return e.message;
  }
}

function verifyHashPreimage(config: Buffer, answer: string): string | null {
  if (config.length !== 32) return "Invalid config: expected 32-byte hash";
  const actual = createHash("sha256").update(answer).digest();
  if (!actual.equals(config)) return "Wrong answer";
  return null;
}

function verifySat(config: Buffer, solution: string): string | null {
  if (config.length < 2) return "Invalid SAT config";
  const numVars    = config[0];
  const numClauses = config[1];
  if (numVars < 1 || numVars > 20)    return "Invalid config: numVars out of range";
  if (numClauses < 1 || numClauses > 12) return "Invalid config: numClauses out of range";

  const parts = solution.split(",");
  if (parts.length !== numVars) return `Expected ${numVars} comma-separated values, got ${parts.length}`;

  const assignment: boolean[] = [false]; // 1-indexed
  for (const p of parts) {
    const v = p.trim();
    if (v !== "0" && v !== "1") return `Invalid value '${v}': must be 0 or 1`;
    assignment.push(v === "1");
  }

  let pos = 2;
  for (let c = 0; c < numClauses; c++) {
    if (pos >= config.length) return "Config too short";
    const numLits = config[pos++];
    if (numLits < 1 || numLits > 5) return "Invalid config: clause size out of range";
    let satisfied = false;
    for (let l = 0; l < numLits; l++) {
      if (pos >= config.length) return "Config too short";
      const raw = config[pos++];
      const lit = raw > 127 ? raw - 256 : raw; // u8 → i8
      if (lit === 0) return "Invalid config: zero literal";
      const varIdx = Math.abs(lit);
      if (varIdx > numVars) return "Invalid config: variable index out of range";
      const val = lit > 0 ? assignment[varIdx] : !assignment[varIdx];
      if (val) satisfied = true;
    }
    if (!satisfied) return `Clause ${c + 1} is not satisfied`;
  }
  return null;
}

function verifyGraphColoring(config: Buffer, solution: string): string | null {
  if (config.length < 3) return "Invalid graph_coloring config";
  const numVertices = config[0];
  const numColors   = config[1];
  const numEdges    = config[2];
  if (config.length < 3 + numEdges * 2) return "Config too short for edges";

  const parts = solution.split(",");
  if (parts.length !== numVertices) return `Expected ${numVertices} colors, got ${parts.length}`;

  const coloring: number[] = [];
  for (const p of parts) {
    const c = parseInt(p.trim(), 10);
    if (isNaN(c) || c < 0 || c >= numColors) return `Color ${p.trim()} out of range [0,${numColors - 1}]`;
    coloring.push(c);
  }

  for (let i = 0; i < numEdges; i++) {
    const u = config[3 + i * 2];
    const v = config[3 + i * 2 + 1];
    if (u >= numVertices || v >= numVertices) return "Invalid config: edge vertex out of range";
    if (coloring[u] === coloring[v]) return `Adjacent vertices ${u} and ${v} share color ${coloring[u]}`;
  }
  return null;
}

function verifyWasmExec(config: Buffer, solution: string, fullConfig?: Record<string, unknown>): Promise<string | null> {
  if (!fullConfig) return Promise.resolve("Missing fullConfig for wasm_exec verifier");
  return verifyWasmExecAsync(fullConfig, solution);
}

async function verifyWasmExecAsync(fullConfig: Record<string, unknown>, solution: string): Promise<string | null> {
  const wasmBase64 = fullConfig.wasmBase64 as string;
  if (!wasmBase64) return "Missing wasmBase64 in config";
  try {
    const wasmBytes = Buffer.from(wasmBase64, "base64");
    const mod = await WebAssembly.compile(wasmBytes);
    const inst = await WebAssembly.instantiate(mod, {});
    const exports = inst.exports as { verify?: (ptr: number, len: number) => number; memory?: WebAssembly.Memory };
    if (typeof exports.verify !== "function") return "WASM must export verify(ptr, len) -> i32";
    if (!exports.memory) return "WASM must export memory";
    const solBytes = Buffer.from(solution, "utf8");
    if (solBytes.length > 1024) return "Solution too long (max 1024 bytes)";
    const view = new Uint8Array(exports.memory.buffer);
    view.set(solBytes, 0);
    const result = exports.verify(0, solBytes.length);
    return result !== 0 ? null : "Wrong answer";
  } catch (e: any) {
    return `WASM execution error: ${e.message}`;
  }
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
  {
    type: "hash_preimage",
    name: "Hash Preimage",
    description:
      "Submit a string whose SHA-256 hash matches the stored target. Perfect for proof-of-knowledge puzzles, CTF challenges, and commit-reveal schemes.",
    configSchema: {
      type: "object",
      required: ["targetHash"],
      properties: {
        targetHash: { type: "string", description: "64-char hex SHA-256 of the correct answer." },
      },
    },
    answerFormat: "Plaintext string (hashed on-chain, compared to targetHash)",
    example: {
      config: { targetHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
      correctAnswer: "hello",
    },
  },
  {
    type: "sat",
    name: "Boolean SAT (CNF)",
    description:
      "Submit a variable assignment that satisfies all clauses of a CNF boolean formula. SAT is NP-complete — encodes scheduling, graph coloring, Sudoku, and any NP decision problem.",
    configSchema: {
      type: "object",
      required: ["numVars", "clauses"],
      properties: {
        numVars: { type: "number", description: "Number of boolean variables (1–20)" },
        clauses: {
          type: "array",
          description: "Clauses in CNF. Each clause is an array of nonzero integers (positive=var, negative=negation, 1-indexed).",
          items: { type: "array", items: { type: "number" } },
        },
      },
    },
    answerFormat: "Comma-separated 0/1 values, one per variable (1-indexed). e.g. \"1,0,1\" → x1=true, x2=false, x3=true.",
    limits: "Max 20 variables, 12 clauses, 5 literals per clause.",
    example: {
      config: { numVars: 3, clauses: [[1, 2, -3], [-1, 3], [2, -3]] },
      correctAnswer: "1,1,1",
    },
  },
  {
    type: "graph_coloring",
    name: "Graph K-Coloring",
    description:
      "Submit a vertex color assignment where no two adjacent vertices share a color. Encodes scheduling, register allocation, and frequency assignment problems.",
    configSchema: {
      type: "object",
      required: ["numVertices", "numColors", "edges"],
      properties: {
        numVertices: { type: "number", description: "Number of vertices (1–15)" },
        numColors:   { type: "number", description: "Max colors K (1–8)" },
        edges: {
          type: "array",
          description: "[u, v] pairs (0-indexed vertex numbers)",
          items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        },
      },
    },
    answerFormat: "Comma-separated color integers (0-indexed), one per vertex. e.g. \"0,1,2,0,1\".",
    limits: "Max 15 vertices, 8 colors, 30 edges.",
    example: {
      config: { numVertices: 4, numColors: 2, edges: [[0,1],[1,2],[2,3]] },
      correctAnswer: "0,1,0,1",
    },
  },
  {
    type: "wasm_exec",
    name: "WASM Execution",
    description: "Upload a compiled WASM binary. Your checker receives the solution string via linear memory and returns 1 for correct, 0 for wrong. Enables any problem with a deterministic verifier.",
    configSchema: {
      type: "object",
      required: ["wasmBase64", "description"],
      properties: {
        wasmBase64: { type: "string", description: "Base64-encoded .wasm binary. Must export verify(ptr: i32, len: i32) -> i32 and memory." },
        description: { type: "string", description: "Human-readable description of what the checker verifies." },
      },
    },
    answerFormat: "Plain string passed to WASM as UTF-8 bytes at memory offset 0.",
    limits: "Max 500KB WASM binary, max 1024-byte solution string.",
    example: {
      config: { wasmBase64: "AGFzbQ...", description: "Checks if input is the string '97'" },
      correctAnswer: "97",
    },
  },
];
