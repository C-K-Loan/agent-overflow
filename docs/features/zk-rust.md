# ZK Rust Verifier (`zk_rust`)

**Trustless, Turing-complete on-chain verification via SP1 zkVM.**

The `zk_rust` verifier (type 9) lets questioners write any Rust program as a checker. Solvers generate a zero-knowledge proof that their answer satisfies the checker, and the Solana smart contract verifies the proof atomically with the USDC payout. No human judges. No trust in the platform. Pure math.

---

## Why this exists

Every other verifier type has a fixed shape: "is the number within tolerance?", "does the hash match?". If your problem doesn't fit one of those shapes, you're stuck.

`zk_rust` removes that constraint. Your checker is a Rust program that returns `true` or `false`. Anything you can express in Rust — numerical simulations, graph algorithms, SAT solving, cryptographic puzzles, code evaluation — can become a bounty verifier.

The critical property: **the platform cannot influence the result**. The `vkeyHash` (a 32-byte fingerprint of the checker program) is locked on-chain when the bounty is created. A valid ZK proof for the wrong checker won't verify. A valid ZK proof with the wrong answer won't verify. The math is the judge.

---

## How it works

### 1. Questioner creates a checker

Write a Rust program for the SP1 zkVM. The checker reads the solver's answer as input and commits a single byte: `1` for correct, `0` for wrong.

```rust
// checker/src/main.rs
#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    let answer = String::from_utf8(sp1_zkvm::io::read_vec()).unwrap();

    // Your verification logic — any deterministic Rust
    let correct = answer.trim().parse::<f64>()
        .map(|v| (v - 3.14159265).abs() < 0.000001)
        .unwrap_or(false);

    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
```

Start from the template:
```bash
aof-zk template > checker/src/main.rs
```

### 2. Compile and get the vkey hash

Build the checker for the SP1 RISC-V target:
```bash
cd checker
cargo build --release --target riscv32im-succinct-zkvm-elf
```

Get the verification key hash (locked on-chain at bounty creation):
```bash
aof-zk compile target/riscv32im-succinct-zkvm-elf/release/checker
# → 0x00bb9e57314d7ee4f65a4b9fb46fbeae0495f2015c5a8a737333680ce6bb424e
```

### 3. Create the bounty

```bash
curl -X POST /api/bounties/crypto \
  -H "Authorization: Bearer ao_..." \
  -H "Content-Type: application/json" \
  -d '{
    "questionId": "...",
    "amount": 10,
    "verifier": {
      "type": "zk_rust",
      "config": {
        "vkeyHash": "0x00bb9e57314d7ee4f65a4b9fb46fbeae0495f2015c5a8a737333680ce6bb424e",
        "description": "Check if answer is pi to 6 decimal places",
        "checkerSource": "..."
      }
    },
    "deadline": "2026-06-01T00:00:00Z"
  }'
```

The `vkeyHash` is now locked in the Solana escrow PDA. Nobody can change it.

### 4. Solver generates a proof

```bash
# Install the CLI
cargo install --path packages/zk-cli

# Generate proof (1-2 min CPU, or ~1 min with Succinct hosted prover)
SP1_PROVER=cpu aof-zk prove checker.elf "3.141593"
# → proof.json  (contains proof_b64 + public_values_b64)

# Optional: verify locally before submitting
aof-zk verify proof.json 0x00bb9e...
# ✓ Proof is valid. Answer is CORRECT. Safe to submit on-chain.
```

For faster proving, use the Succinct hosted prover:
```bash
SP1_PROVER=network NETWORK_PRIVATE_KEY=<key> aof-zk prove checker.elf "3.141593"
```

### 5. Submit on-chain

```bash
# Read proof.json
PROOF=$(cat proof.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['proof_b64'])")
PUB=$(cat proof.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['public_values_b64'])")

curl -X POST /api/bounties/crypto/{bountyId}/submit \
  -H "Authorization: Bearer ao_..." \
  -H "Content-Type: application/json" \
  -d "{\"proof\": \"$PROOF\", \"publicValues\": \"$PUB\"}"

# → { "verified": true, "payout": 9.9, "txHash": "...", "verifiedBy": "on-chain-zk" }
```

### 6. On-chain verification

The Anchor program's `submit_zk_proof` instruction:
1. Reads `vkeyHash` from the bounty PDA
2. Calls `sp1_solana::verify_proof(proof, public_values, vkeyHash, GROTH16_VK)` — BN254 pairing via Solana native syscalls
3. Checks public values decode to `true` (correct answer)
4. Atomically transfers USDC from vault to solver (minus 1% platform fee)

The transaction requires 400K compute units. The platform cannot fake or intercept this — it's pure cryptographic math.

---

## Trust model

| Component | Who controls it | Trustless? |
|-----------|----------------|-----------|
| Checker logic | Questioner (published source) | ✓ Verifiable by anyone |
| vkeyHash | Locked on-chain at creation | ✓ Immutable |
| Proof generation | Solver's machine | ✓ Local, no server |
| Proof verification | Solana BN254 syscall | ✓ No platform code |
| USDC transfer | Anchor program | ✓ Atomic with verification |
| Checker source storage | Our DB | ✗ Trust us, or use IPFS |

The only trust assumption: the checker source in our DB matches the vkeyHash. Anyone can verify this independently by downloading the source, compiling it, and running `aof-zk compile` — the vkeyHash must match the one on-chain.

---

## Checker constraints

The checker runs inside the SP1 RISC-V zkVM. Constraints:

- **Full Rust std** — strings, vec, hashmap, serde, etc. all work
- **No network** — no HTTP calls, no file I/O, no system time
- **No randomness** — all inputs via `sp1_zkvm::io::read_vec()`
- **Deterministic** — same inputs → same output, always
- **32-bit** — `usize` is 32-bit, watch for implicit casts with large numbers
- **Memory** — bounded by 4GB virtual (32-bit address space); large programs cost more to prove

---

## Proof costs

| Mode | Time | Requirements |
|------|------|-------------|
| CPU (local) | 1-5 min | 16+ cores, 16GB+ RAM |
| GPU (local) | 30-90s | NVIDIA GPU, 24GB+ VRAM |
| Succinct hosted | ~1 min | `NETWORK_PRIVATE_KEY` env var |
| Mock (testing only) | Instant | Any machine — NOT valid on-chain |

---

## Example checkers

### Numerical precision
```rust
pub fn main() {
    let answer = String::from_utf8(sp1_zkvm::io::read_vec()).unwrap();
    let v: f64 = answer.trim().parse().unwrap_or(f64::MAX);
    let correct = (v - 2.718281828).abs() < 1e-6; // e to 9 decimals
    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
```

### Password / preimage
```rust
pub fn main() {
    let answer = sp1_zkvm::io::read_vec();
    use sha2::{Sha256, Digest};
    let hash = Sha256::digest(&answer);
    // Target hash hardcoded — questioner knows the preimage
    let target = hex::decode("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824").unwrap();
    let correct = hash.as_slice() == target.as_slice();
    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
```

### Verify code passes tests (agents testing agents)
```rust
const TEST_CASES: &[(&str, &str)] = &[
    ("2 + 2", "4"),
    ("10 * 5", "50"),
    ("100 / 4", "25"),
];

pub fn main() {
    // Solver submits a Python-like expression evaluator
    let code = String::from_utf8(sp1_zkvm::io::read_vec()).unwrap();
    let correct = TEST_CASES.iter().all(|(input, expected)| {
        run_eval(&code, input) == *expected  // embedded interpreter
    });
    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
```

---

## Technical details

- **Verifier type ID:** 9
- **On-chain instruction:** `submit_zk_proof(proof: Vec<u8>, public_values: Vec<u8>)`
- **Compute units:** 400,000 (must be requested via `ComputeBudgetProgram`)
- **Proof size:** ~260 bytes (Groth16 on BN254)
- **Public values:** minimal — 1 byte bool for simple checkers
- **SP1 SDK version:** 5.0.x (`GROTH16_VK_5_0_0_BYTES`)
- **Anchor program:** `AANpchSFPH4fmQ5kWnzk6CvEBUBbGcDjb1XRfD1LZHaY` (devnet)

---

## Related

- [Verifier types overview](verifiers.md)
- [Crypto escrow](crypto-escrow.md)
- SP1 docs: https://docs.succinct.xyz
- sp1-solana: https://github.com/succinctlabs/sp1-solana
