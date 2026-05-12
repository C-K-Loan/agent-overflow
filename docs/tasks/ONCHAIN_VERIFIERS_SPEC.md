# On-Chain Verifiers for Types 5-7 — Task Spec

## ✅ COMPLETED 2026-05-12 (merged to master)

Types 5-7 now do a real vault release via `submit_answer` with verifier_type=255
(pass-through). The Rust program sees a pre-verified answer and releases funds
from vault → answerer ATA. No more mintTo. Clean vault transfer on Solscan.

See: `app/src/app/api/bounties/crypto/[id]/submit/route.ts` → `handleTsOnlyPayout`

## Previous problem

Types 5-8 were marked `TS_ONLY_VERIFIERS` — server verified in TypeScript, then
paid by calling `mintTo` (minting new devnet USDC). Broke on mainnet.

## Current state

| Type | Name | Current | Target |
|------|------|---------|--------|
| 0 | exact_string | On-chain ✅ | — |
| 1 | exact_number | On-chain ✅ | — |
| 2 | numeric_tolerance | On-chain ✅ | — |
| 3 | numeric_range | On-chain ✅ | — |
| 4 | multi_numeric_tolerance | On-chain ✅ | — |
| **5** | **hash_preimage** | **Real vault ✅** | Done |
| **6** | **sat** | **TS-only ❌** | **On-chain** |
| **7** | **graph_coloring** | **TS-only ❌** | **On-chain** |
| 8 | wasm_exec | TS-only (acceptable) | Stay TS — WASM can't run on-chain |
| 9 | zk_rust | On-chain ✅ | — |

`wasm_exec` (type 8) is explicitly excluded — WASM execution on-chain is not feasible.
It stays TS-verified and is documented as "trusted server" verification.

---

## What needs to change

### 1. Anchor program (`programs/ao-escrow/src/`)

Add verification logic for types 5, 6, 7 in the `submit_answer` instruction handler.

The TypeScript implementations in `app/src/lib/solana/verifiers.ts` are already the
specification — they document the exact logic. Port them to Rust.

#### Type 5 — hash_preimage

```rust
// Config: 32 bytes = SHA256 target hash
// Solution: plaintext string
// Verify: SHA256(solution) == config[0..32]
fn verify_hash_preimage(config: &[u8], solution: &str) -> bool {
    if config.len() != 32 { return false; }
    use anchor_lang::solana_program::hash::hash;
    let actual = hash(solution.as_bytes());
    actual.to_bytes() == config[0..32]
}
```

Solana has a native `hash()` syscall (SHA256). Cost: ~100 CU. Trivial.

#### Type 6 — SAT

```rust
// Config: [numVars, numClauses, clauseLen, lit0, lit1, ..., clauseLen, lit0, ...]
// Solution: comma-separated "0" / "1" per variable (1-indexed)
// Verify: all clauses satisfied
fn verify_sat(config: &[u8], solution: &str) -> bool {
    if config.len() < 2 { return false; }
    let num_vars    = config[0] as usize;
    let num_clauses = config[1] as usize;

    let parts: Vec<&str> = solution.split(',').collect();
    if parts.len() != num_vars { return false; }

    let mut assignment = vec![false; num_vars + 1]; // 1-indexed
    for (i, p) in parts.iter().enumerate() {
        match p.trim() {
            "1" => assignment[i + 1] = true,
            "0" => assignment[i + 1] = false,
            _   => return false,
        }
    }

    let mut pos = 2;
    for _ in 0..num_clauses {
        if pos >= config.len() { return false; }
        let num_lits = config[pos] as usize;
        pos += 1;
        let mut satisfied = false;
        for _ in 0..num_lits {
            if pos >= config.len() { return false; }
            let raw = config[pos] as i8; // stored as i8
            pos += 1;
            let lit = raw as i32;
            if lit == 0 { return false; }
            let var_idx = lit.unsigned_abs() as usize;
            if var_idx > num_vars { return false; }
            let val = if lit > 0 { assignment[var_idx] } else { !assignment[var_idx] };
            if val { satisfied = true; }
        }
        if !satisfied { return false; }
    }
    true
}
```

Cost: O(vars × clauses) = worst case 20 × 12 = 240 ops. ~1,000 CU. Fine.

#### Type 7 — graph_coloring

```rust
// Config: [numVertices, numColors, numEdges, u0, v0, u1, v1, ...]
// Solution: comma-separated color integers (0-indexed), one per vertex
// Verify: no two adjacent vertices share a color
fn verify_graph_coloring(config: &[u8], solution: &str) -> bool {
    if config.len() < 3 { return false; }
    let num_vertices = config[0] as usize;
    let num_colors   = config[1] as usize;
    let num_edges    = config[2] as usize;
    if config.len() < 3 + num_edges * 2 { return false; }

    let parts: Vec<&str> = solution.split(',').collect();
    if parts.len() != num_vertices { return false; }

    let mut coloring = vec![0usize; num_vertices];
    for (i, p) in parts.iter().enumerate() {
        let c: usize = p.trim().parse().unwrap_or(usize::MAX);
        if c >= num_colors { return false; }
        coloring[i] = c;
    }

    for i in 0..num_edges {
        let u = config[3 + i * 2] as usize;
        let v = config[3 + i * 2 + 1] as usize;
        if u >= num_vertices || v >= num_vertices { return false; }
        if coloring[u] == coloring[v] { return false; }
    }
    true
}
```

Cost: O(edges) = max 30 checks. ~500 CU. Fine.

### 2. Remove from TS_ONLY_VERIFIERS set

In `app/src/lib/solana/verifiers.ts`:

```typescript
// BEFORE:
export const TS_ONLY_VERIFIERS = new Set([5, 6, 7, 8]);

// AFTER:
export const TS_ONLY_VERIFIERS = new Set([8]); // only wasm_exec stays TS-only
```

This causes types 5/6/7 to go through `handleOnChainPayout` instead of
`handleTsOnlyPayout` — they'll use the real vault release path.

### 3. Update SKILL.md + docs

Update the verifier table note: "Types 0-7, 9 verified on-chain. Type 8 (wasm_exec)
is server-side verified — trusted server model."

---

## Compute budget check

Total compute for a submit_answer tx with type 6 (SAT, worst case):
- Account validation: ~5,000 CU
- SAT verification (20 vars, 12 clauses): ~1,000 CU  
- Token transfer (vault → solver): ~4,000 CU
- Fee transfer: ~4,000 CU
- **Total: ~15,000 CU** — well within 200,000 CU default, no priority fees needed

---

## Demo quick-fix (while waiting for Anchor update)

**Don't wait for the Anchor fix to demo cleanly.** Re-post the 3 demo bounties
using `exact_string` instead of `sat`/`graph_coloring`/`hash_preimage`.

`exact_string` is type 0 — on-chain, real vault release, clean Solscan TX.
Semantically identical: stores SHA256(answer) on-chain, solver submits plaintext.

```bash
# Hashes to use:
# SAT answer "1,0,1":
python3 -c "import hashlib; print(hashlib.sha256(b'1,0,1').hexdigest())"
# → 5f9c4ab08cac7457e9111a30e4664920607ea2c115a1433d7be98e97e64244ca

# Graph coloring answer "0,1,2,0,1":
python3 -c "import hashlib; print(hashlib.sha256(b'0,1,2,0,1').hexdigest())"

# Exploit answer "31337":
python3 -c "import hashlib; print(hashlib.sha256(b'31337').hexdigest())"
# → 1483099c89000a68c3d88446a6a7669b765f09900cbfb0898ccd784b2a6bfe2d
```

Re-post bounties as `exact_string` verifiers → clean vault-release TX on Solscan.

---

## Files to change

| File | Change |
|------|--------|
| `programs/ao-escrow/src/lib.rs` | Add verify_hash_preimage, verify_sat, verify_graph_coloring |
| `programs/ao-escrow/src/lib.rs` | Add match arms for types 5, 6, 7 in submit_answer |
| `app/src/lib/solana/verifiers.ts` | Remove 5, 6, 7 from TS_ONLY_VERIFIERS |
| `app/src/app/SKILL.md/route.ts` | Update verifier table note |
| `app/src/app/docs/page.tsx` | Update verifier table |

After Anchor changes: redeploy program → new program ID → update ESCROW_PROGRAM_ID env var.

---

## Effort estimate

| Task | Time |
|------|------|
| Implement 3 verify functions in Rust | 2-3 hrs |
| Wire into submit_answer match arms | 1 hr |
| Test with existing e2e suite | 1 hr |
| Redeploy + update env vars | 30 min |
| Remove from TS_ONLY_VERIFIERS + deploy server | 15 min |
| **Total** | **~5-6 hrs** |

Demo quick-fix (re-post as exact_string): **20 min** — do this now.
Anchor fix: assign to Solana dev, not blocking the demo.
