# New Verifier Types — Implementation Spec

## Overview

Add 4 new verifier types to the existing `ao-escrow` Anchor program.
Current verifiers live in `packages/contracts/programs/ao-escrow/src/verifiers/`.
Follow the exact same pattern as the existing ones.

Program ID: `AANpchSFPH4fmQ5kWnzk6CvEBUBbGcDjb1XRfD1LZHaY`

After implementing, redeploy to devnet and update the IDL.
Also add each new type to the backend (`app/src/lib/solana/verifiers.ts`) and the
frontend create-bounty wizard (`app/src/components/CreateBountyForm.tsx`).

---

## Verifier 1 — Hash Preimage (`hash_preimage`)

### What it does
Poster commits a target hash. Answerer submits a string. The verifier computes
SHA-256 of the submitted string on-chain and checks it matches the target.

Fully trustless. Solana has a native `sol_sha256` syscall — no external calls needed.

### Use cases
- Proof-of-knowledge puzzles ("find the password that hashes to X")
- CTF challenges
- Commit-reveal schemes where the answer was pre-committed
- Proof-of-work style problems ("find string with hash starting in 0000")

### Config shape (stored in `verifierConfig` JSON on the bounty)
```json
{
  "targetHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "hashFunction": "sha256"
}
```
`hashFunction` is always `"sha256"` for now. Field exists for future extensibility.

### Rust implementation

```rust
// packages/contracts/programs/ao-escrow/src/verifiers/hash_preimage.rs

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

pub fn verify_hash_preimage(config: &str, solution: &str) -> bool {
    let config: serde_json::Value = match serde_json::from_str(config) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let target = match config["targetHash"].as_str() {
        Some(t) => t,
        None => return false,
    };

    // Compute SHA-256 using Solana native syscall
    let hash = hashv(&[solution.as_bytes()]);
    let computed = hex::encode(hash.to_bytes());

    computed == target
}
```

### Verifier type constant
Add `pub const VERIFIER_HASH_PREIMAGE: u8 = 5;` to `constants.rs`.

### Frontend config fields (CreateBountyForm.tsx)
- `targetHash` — text input, label "Target SHA-256 Hash", placeholder `e3b0c44...`
- Helper text: "The answer must be a string whose SHA-256 hash equals this value."
- Add a "compute hash" helper button that lets the poster type a known answer and auto-fills the hash (so they can set up a puzzle without revealing the answer)

### Python SDK
```python
ao.create_crypto_bounty(
    question_id="...",
    verifier_type="hash_preimage",
    config={"targetHash": "e3b0c44298fc1c149afbf4c8996fb924..."},
    amount=50.0,
    deadline="2026-05-15T00:00:00Z"
)
```

---

## Verifier 2 — SAT Solution (`sat`)

### What it does
Poster submits a boolean satisfiability problem in CNF (conjunctive normal form).
Answerer submits a variable assignment. Verifier checks every clause on-chain.

Verification is O(clauses × literals per clause) — extremely fast.
Finding a satisfying assignment is NP-complete — can be very hard.

This is the most powerful verifier: SAT is NP-complete, meaning any combinatorial
optimization problem (graph coloring, scheduling, planning, circuit verification,
Sudoku, TSP decision variant) can be encoded as SAT.

### Use cases
- Graph coloring ("3-color this graph")
- Scheduling problems ("assign these tasks without conflicts")
- Circuit satisfiability
- Puzzle solving (Sudoku, nonograms, etc.)
- Any NP decision problem

### Config shape
CNF formula stored as array of clauses. Each clause is an array of integers.
Positive integer = variable (1-indexed). Negative = negation. Zero = end of clause (DIMACS convention).

```json
{
  "numVars": 3,
  "clauses": [
    [1, 2, -3],
    [-1, 3],
    [2, -3],
    [-1, -2]
  ]
}
```

This encodes: `(x1 ∨ x2 ∨ ¬x3) ∧ (¬x1 ∨ x3) ∧ (x2 ∨ ¬x3) ∧ (¬x1 ∨ ¬x2)`

### Solution shape
Submitted as a JSON array of booleans, 1-indexed (index 0 ignored):
```json
[null, true, false, true]
```
Means: x1=true, x2=false, x3=true

### Rust implementation

```rust
// packages/contracts/programs/ao-escrow/src/verifiers/sat.rs

use anchor_lang::prelude::*;

pub fn verify_sat(config: &str, solution: &str) -> bool {
    let config: serde_json::Value = match serde_json::from_str(config) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let solution: serde_json::Value = match serde_json::from_str(solution) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let num_vars = match config["numVars"].as_u64() {
        Some(n) => n as usize,
        None => return false,
    };

    let clauses = match config["clauses"].as_array() {
        Some(c) => c,
        None => return false,
    };

    let assignment = match solution.as_array() {
        Some(a) => a,
        None => return false,
    };

    // assignment is 1-indexed: assignment[i] = value of variable i
    if assignment.len() < num_vars + 1 {
        return false;
    }

    // Check every clause
    for clause in clauses {
        let literals = match clause.as_array() {
            Some(l) => l,
            None => return false,
        };

        let mut clause_satisfied = false;
        for lit in literals {
            let lit_val = match lit.as_i64() {
                Some(v) => v,
                None => return false,
            };
            if lit_val == 0 { continue; }

            let var_idx = lit_val.unsigned_abs() as usize;
            if var_idx > num_vars { return false; }

            let var_value = match assignment[var_idx].as_bool() {
                Some(b) => b,
                None => return false,
            };

            let literal_true = if lit_val > 0 { var_value } else { !var_value };
            if literal_true {
                clause_satisfied = true;
                break;
            }
        }

        if !clause_satisfied {
            return false; // This clause is not satisfied
        }
    }

    true // All clauses satisfied
}
```

### Verifier type constant
Add `pub const VERIFIER_SAT: u8 = 6;` to `constants.rs`.

### Limits
Cap at 500 clauses and 100 variables to stay within compute budget.
Enforce in the `create_bounty` instruction before storing.
Return `ErrorCode::VerifierConfigTooLarge` if exceeded.

### Frontend config fields
- `numVars` — number input
- `clauses` — textarea accepting DIMACS CNF format (standard SAT solver format)
- Add a DIMACS parser so poster can paste output from any SAT tool
- Helper text: "DIMACS CNF format. Each line is a clause ending in 0. Variables are integers 1..N."
- Example button that fills in a simple 3-variable example

### Python SDK
```python
ao.create_crypto_bounty(
    question_id="...",
    verifier_type="sat",
    config={
        "numVars": 3,
        "clauses": [[1, 2, -3], [-1, 3], [2, -3]]
    },
    amount=100.0,
    deadline="2026-05-15T00:00:00Z"
)
# Submit solution:
ao.submit_crypto_solution(bounty_id, solution='[null, true, false, true]')
```

---

## Verifier 3 — Graph Coloring (`graph_coloring`) ⚠️ NOT IMPLEMENTED — planned only

### What it does
Poster commits a graph (adjacency list) and a number of colors K.
Answerer submits a color assignment (one color per vertex).
Verifier checks: (1) all colors are in range [0, K-1], (2) no two adjacent vertices share a color.

### Use cases
- Schedule N tasks where conflicting tasks can't run simultaneously
- Map coloring
- Register allocation (compiler optimization)
- Frequency assignment
- Any graph coloring / independent set problem

### Config shape
```json
{
  "numVertices": 5,
  "numColors": 3,
  "edges": [[0,1], [1,2], [2,3], [3,4], [4,0], [0,2]]
}
```

### Solution shape
JSON array of integers, one per vertex (0-indexed color):
```json
[0, 1, 0, 1, 2]
```

### Rust implementation

```rust
// packages/contracts/programs/ao-escrow/src/verifiers/graph_coloring.rs

pub fn verify_graph_coloring(config: &str, solution: &str) -> bool {
    let config: serde_json::Value = match serde_json::from_str(config) { Ok(v) => v, Err(_) => return false };
    let solution: serde_json::Value = match serde_json::from_str(solution) { Ok(v) => v, Err(_) => return false };

    let num_vertices = match config["numVertices"].as_u64() { Some(n) => n as usize, None => return false };
    let num_colors   = match config["numColors"].as_u64()   { Some(n) => n as usize, None => return false };
    let edges        = match config["edges"].as_array()      { Some(e) => e,          None => return false };
    let coloring     = match solution.as_array()             { Some(c) => c,          None => return false };

    if coloring.len() != num_vertices { return false; }

    // Validate all colors are in range
    for c in coloring {
        let color = match c.as_u64() { Some(v) => v as usize, None => return false };
        if color >= num_colors { return false; }
    }

    // Check no adjacent vertices share a color
    for edge in edges {
        let e = match edge.as_array() { Some(e) => e, None => return false };
        if e.len() != 2 { return false; }
        let u = match e[0].as_u64() { Some(v) => v as usize, None => return false };
        let v = match e[1].as_u64() { Some(v) => v as usize, None => return false };
        if u >= num_vertices || v >= num_vertices { return false; }
        let cu = coloring[u].as_u64().unwrap() as usize;
        let cv = coloring[v].as_u64().unwrap() as usize;
        if cu == cv { return false; } // Adjacent vertices same color — invalid
    }

    true
}
```

### Verifier type constant
Add `pub const VERIFIER_GRAPH_COLORING: u8 = 7;` to `constants.rs`.

### Limits
Cap at 200 vertices and 1000 edges. Enforce in `create_bounty`.

### Frontend config fields
- `numVertices` — number input
- `numColors` — number input (label: "Max colors K")
- `edges` — textarea, one edge per line as `u v` (space-separated vertex indices)
- Helper: adjacency matrix paste support

---

## Verifier 4 — WASM Execution (`wasm_exec`)

### What it does
The most powerful verifier. Poster uploads a compiled WASM binary (their custom checker).
The verifier executes the WASM with the submitted solution as input.
If the WASM returns 1 (or any nonzero), the bounty pays out.

This enables ANY problem with a deterministic checker to become a bounty.

### ⚠️ Important constraints
- WASM binary stored in a separate Solana account (can be up to 10MB)
- Execution is capped at 100K compute units (out of the 200K budget)
- WASM must export a single function: `verify(ptr: i32, len: i32) -> i32`
- Input is the solution string passed as a linear memory slice
- Return 1 = correct, 0 = wrong
- No imports allowed (no filesystem, no network, no syscalls) — pure computation only
- Use a WASM interpreter in the Anchor program (e.g. `wasmi` crate)

### Use cases
- Custom math problems (poster writes a Python/Rust checker, compiles to WASM)
- Competitive programming (poster provides the judge binary)
- Any problem where the poster can write a checker but can't express it in the other verifiers

### Config shape
```json
{
  "wasmAccountPubkey": "AbCd1234...",
  "maxComputeUnits": 50000,
  "description": "Checks if input is a valid solution to the knapsack problem"
}
```

WASM binary stored in a separate account (too large for config JSON).
Account must be owned by the escrow program (created during bounty setup).

### Solution shape
Plain string — passed directly to WASM as UTF-8 bytes.

### Rust implementation (outline)

```rust
// packages/contracts/programs/ao-escrow/src/verifiers/wasm_exec.rs
// Uses wasmi crate for WASM interpretation

use wasmi::{Engine, Linker, Module, Store};

pub fn verify_wasm(config: &str, solution: &str, wasm_bytes: &[u8]) -> bool {
    let engine = Engine::default();
    let module = match Module::new(&engine, wasm_bytes) {
        Ok(m) => m,
        Err(_) => return false,
    };

    let mut store = Store::new(&engine, ());
    let linker = Linker::new(&engine);

    let instance = match linker.instantiate(&mut store, &module)
        .and_then(|i| i.start(&mut store)) {
        Ok(i) => i,
        Err(_) => return false,
    };

    // Get linear memory and write solution bytes
    let memory = match instance.get_memory(&store, "memory") {
        Some(m) => m,
        None => return false,
    };

    let solution_bytes = solution.as_bytes();
    let ptr = 0i32; // Write at offset 0
    memory.write(&mut store, ptr as usize, solution_bytes).ok()?;

    // Call verify(ptr, len) -> i32
    let verify_fn = match instance.get_typed_func::<(i32, i32), i32>(&store, "verify") {
        Ok(f) => f,
        Err(_) => return false,
    };

    match verify_fn.call(&mut store, (ptr, solution_bytes.len() as i32)) {
        Ok(result) => result != 0,
        Err(_) => false,
    }
}
```

### Cargo.toml addition
```toml
[dependencies]
wasmi = { version = "0.31", default-features = false, features = ["no_std"] }
```

### New Anchor instruction needed: `upload_wasm`
```rust
pub fn upload_wasm(ctx: Context<UploadWasm>, wasm_bytes: Vec<u8>) -> Result<()>
// Creates a new account owned by the program, stores the WASM bytes
// Returns the account pubkey to use in the config
```

### Frontend
- File upload button: "Upload WASM checker (.wasm)"
- Shows file size + warns if > 500KB
- Helper text: "Your WASM must export `verify(ptr: i32, len: i32) -> i32`. Return 1 for correct, 0 for wrong."
- Link to example WASM checkers in the docs

### Note on priority
WASM is the most complex (~3-4 days). Build hash_preimage and SAT first.
WASM is a stretch goal if time allows.

---

## Shared implementation steps

### 1. Rust (Anchor program)
1. Create new file in `packages/contracts/programs/ao-escrow/src/verifiers/`
2. Add `pub mod <name>;` to `verifiers/mod.rs`
3. Add new constant to `constants.rs`
4. Wire into `submit_answer.rs` match statement on `verifier_type`
5. Add size limits enforcement in `create_bounty.rs`
6. Run `anchor build` — redeploy to devnet with `anchor deploy`

### 2. Backend TypeScript
File: `app/src/lib/solana/verifiers.ts`
- Add new verifier type to the `VerifierType` enum
- Add config validation function
- Add display name and description

File: `app/src/app/api/bounties/crypto/verifiers/route.ts`
- Add new verifier to the GET response

### 3. Frontend
File: `app/src/components/CreateBountyForm.tsx`
- Add new case to the verifier selector
- Add config input fields for each new type
- Add input validation

### 4. Python SDK
File: `packages/sdk-python/agent_overflow/client.py`
- No changes needed — `create_crypto_bounty` already takes `verifier_type: str` and `config: dict`
- Add examples to docstrings

### 5. Tests
File: `packages/contracts/tests/ao-escrow.ts`
- Add passing test (correct solution → bounty awarded)
- Add failing test (wrong solution → rejected)
- For SAT: test unsatisfied clause, wrong number of vars, etc.

---

## Priority order

| # | Verifier | Effort | Impact |
|---|----------|--------|--------|
| 1 | Hash Preimage | 1 day | High — crypto-native, impressive to judges |
| 2 | SAT | 2 days | Very high — covers all NP problems |
| 3 | Graph Coloring | 1 day | Medium — concrete, visual, easy to demo |
| 4 | WASM Execution | 3-4 days | Highest — but complex, stretch goal |

Ship 1+2+3 first. WASM only if time allows.
