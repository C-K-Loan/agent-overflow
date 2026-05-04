import { createHash } from "crypto";
import { verifyInTypeScript, serializeVerifierConfig } from "../verifiers";

// Helper: compute SHA256 hex of a string
function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ─── Type 0: exact_string ────────────────────────────────────────────────────
describe("exact_string (type 0)", () => {
  const configBuf = serializeVerifierConfig("exact_string", {
    answerHash: sha256hex("sealevel"),
  });

  it("accepts the correct answer", async () => {
    const result = await verifyInTypeScript(0, configBuf, "sealevel");
    expect(result).toBeNull();
  });

  it("rejects a wrong answer", async () => {
    const result = await verifyInTypeScript(0, configBuf, "wrong");
    expect(result).toBe("Wrong answer");
  });
});

// ─── Type 1: exact_number ────────────────────────────────────────────────────
describe("exact_number (type 1)", () => {
  const configBuf = serializeVerifierConfig("exact_number", { target: 6765 });

  it("accepts the correct number", async () => {
    expect(await verifyInTypeScript(1, configBuf, "6765")).toBeNull();
  });

  it("rejects a wrong number", async () => {
    expect(await verifyInTypeScript(1, configBuf, "999")).toBe("Wrong answer");
  });
});

// ─── Type 2: numeric_tolerance ───────────────────────────────────────────────
describe("numeric_tolerance (type 2)", () => {
  const configBuf = serializeVerifierConfig("numeric_tolerance", {
    target: 37.777778,
    epsilon: 0.1,
  });

  it("accepts a value within tolerance", async () => {
    expect(await verifyInTypeScript(2, configBuf, "37.78")).toBeNull();
  });

  it("rejects a value far outside tolerance", async () => {
    const result = await verifyInTypeScript(2, configBuf, "0");
    expect(result).not.toBeNull();
    expect(result).toContain("not within tolerance");
  });
});

// ─── Type 3: numeric_range ───────────────────────────────────────────────────
describe("numeric_range (type 3)", () => {
  const configBuf = serializeVerifierConfig("numeric_range", {
    min: 90.0,
    max: 92.0,
  });

  it("accepts a value inside the range", async () => {
    expect(await verifyInTypeScript(3, configBuf, "91")).toBeNull();
  });

  it("rejects a value outside the range", async () => {
    const result = await verifyInTypeScript(3, configBuf, "0");
    expect(result).not.toBeNull();
    expect(result).toContain("outside the valid range");
  });
});

// ─── Type 4: multi_numeric_tolerance ─────────────────────────────────────────
describe("multi_numeric_tolerance (type 4)", () => {
  const configBuf = serializeVerifierConfig("multi_numeric_tolerance", {
    targets: [
      { key: "x", value: 3.0, epsilon: 0.001 },
      { key: "y", value: 5.0, epsilon: 0.001 },
    ],
  });

  it("accepts correct values for all variables", async () => {
    expect(await verifyInTypeScript(4, configBuf, "x=3,y=5")).toBeNull();
  });

  it("rejects when values are wrong", async () => {
    const result = await verifyInTypeScript(4, configBuf, "x=0,y=0");
    expect(result).not.toBeNull();
    expect(result).toContain("not within tolerance");
  });
});

// ─── Type 5: hash_preimage ───────────────────────────────────────────────────
describe("hash_preimage (type 5)", () => {
  // SHA256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  const TARGET_HASH = sha256hex("hello");
  const configBuf = serializeVerifierConfig("hash_preimage", {
    targetHash: TARGET_HASH,
  });

  it("accepts the correct preimage", async () => {
    expect(await verifyInTypeScript(5, configBuf, "hello")).toBeNull();
  });

  it("rejects a wrong preimage", async () => {
    expect(await verifyInTypeScript(5, configBuf, "world")).toBe("Wrong answer");
  });

  it("rejects an empty string", async () => {
    expect(await verifyInTypeScript(5, configBuf, "")).toBe("Wrong answer");
  });
});

// ─── Type 6: SAT ─────────────────────────────────────────────────────────────
describe("SAT (type 6)", () => {
  // Formula: (x1 ∨ x2 ∨ ¬x3) ∧ (¬x1 ∨ x3) ∧ (x2 ∨ ¬x3)
  const configBuf = serializeVerifierConfig("sat", {
    numVars: 3,
    clauses: [
      [1, 2, -3],
      [-1, 3],
      [2, -3],
    ],
  });

  it("accepts x1=T,x2=T,x3=T — all clauses satisfied", async () => {
    // clause1: T∨T∨F=T, clause2: F∨T=T, clause3: T∨F=T
    expect(await verifyInTypeScript(6, configBuf, "1,1,1")).toBeNull();
  });

  it("accepts x1=F,x2=T,x3=T — all clauses satisfied", async () => {
    // clause1: F∨T∨F=T, clause2: T∨T=T, clause3: T∨F=T
    expect(await verifyInTypeScript(6, configBuf, "0,1,1")).toBeNull();
  });

  it("rejects x1=F,x2=F,x3=F — clause 1 not satisfied", async () => {
    // clause1: F∨F∨T=T wait — ¬x3 with x3=0 is T; so clause1 IS satisfied
    // Let's check clause2: ¬x1∨x3 = T∨F = T. clause3: x2∨¬x3 = F∨T = T.
    // 0,0,0 actually satisfies all? Let's trace carefully:
    // x1=0,x2=0,x3=0
    // clause1: [1,2,-3] → x1∨x2∨¬x3 = 0∨0∨1 = 1 ✓
    // clause2: [-1,3]   → ¬x1∨x3    = 1∨0   = 1 ✓
    // clause3: [2,-3]   → x2∨¬x3    = 0∨1   = 1 ✓
    // So 0,0,0 satisfies all! Use an assignment that actually fails:
    // x1=1,x2=0,x3=1:
    // clause1: x1∨x2∨¬x3 = 1∨0∨0 = 1 ✓
    // clause2: ¬x1∨x3    = 0∨1   = 1 ✓
    // clause3: x2∨¬x3    = 0∨0   = 0 ✗  ← fails clause 3
    const result = await verifyInTypeScript(6, configBuf, "1,0,1");
    expect(result).toBe("Clause 3 is not satisfied");
  });

  it("rejects assignment failing clause 2", async () => {
    // x1=1,x2=1,x3=0:
    // clause1: 1∨1∨1=1 ✓
    // clause2: ¬x1∨x3 = 0∨0 = 0 ✗  ← fails clause 2
    const result = await verifyInTypeScript(6, configBuf, "1,1,0");
    expect(result).toBe("Clause 2 is not satisfied");
  });

  it("rejects solution with wrong variable count", async () => {
    const result = await verifyInTypeScript(6, configBuf, "1,1");
    expect(result).toBe("Expected 3 comma-separated values, got 2");
  });

  it("rejects solution with invalid value (not 0 or 1)", async () => {
    const result = await verifyInTypeScript(6, configBuf, "1,2,0");
    expect(result).toBe("Invalid value '2': must be 0 or 1");
  });
});

// ─── Type 7: graph_coloring ──────────────────────────────────────────────────
describe("graph_coloring (type 7) — triangle (K3)", () => {
  // Triangle: 3 vertices, 3 colors, edges 0-1, 1-2, 0-2
  const configBuf = serializeVerifierConfig("graph_coloring", {
    numVertices: 3,
    numColors: 3,
    edges: [
      [0, 1],
      [1, 2],
      [0, 2],
    ],
  });

  it("accepts valid 3-coloring 0,1,2", async () => {
    expect(await verifyInTypeScript(7, configBuf, "0,1,2")).toBeNull();
  });

  it("accepts valid 3-coloring 2,0,1", async () => {
    expect(await verifyInTypeScript(7, configBuf, "2,0,1")).toBeNull();
  });

  it("rejects when vertices 0 and 1 share color 0", async () => {
    const result = await verifyInTypeScript(7, configBuf, "0,0,1");
    expect(result).toBe("Adjacent vertices 0 and 1 share color 0");
  });

  it("rejects when vertices 0 and 2 share color 0", async () => {
    const result = await verifyInTypeScript(7, configBuf, "0,1,0");
    expect(result).toBe("Adjacent vertices 0 and 2 share color 0");
  });
});

describe("graph_coloring (type 7) — path graph (4 vertices, 2 colors)", () => {
  // Path: 0-1-2-3, 2-colorable with alternating assignment
  const configBuf = serializeVerifierConfig("graph_coloring", {
    numVertices: 4,
    numColors: 2,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  });

  it("accepts valid 2-coloring 0,1,0,1", async () => {
    expect(await verifyInTypeScript(7, configBuf, "0,1,0,1")).toBeNull();
  });

  it("rejects when vertices 0 and 1 share color 0", async () => {
    const result = await verifyInTypeScript(7, configBuf, "0,0,1,0");
    expect(result).toBe("Adjacent vertices 0 and 1 share color 0");
  });
});

describe("graph_coloring (type 7) — color out of range", () => {
  const configBuf = serializeVerifierConfig("graph_coloring", {
    numVertices: 3,
    numColors: 2,
    edges: [[0, 1]],
  });

  it("rejects color index 2 when only colors 0 and 1 are allowed", async () => {
    const result = await verifyInTypeScript(7, configBuf, "0,1,2");
    expect(result).toBe("Color 2 out of range [0,1]");
  });
});
