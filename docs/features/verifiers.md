# Verifier Types

Smart contract verification methods for crypto bounties. Each verifier defines how an answer is checked on-chain.

## Available (MVP)

### exact_number (Type 0)
**Use case**: Math problems with exact integer answers
```json
{ "type": "exact_number", "config": { "target": 42 } }
```
Submit: `"42"` — contract checks `submitted == target`

### exact_string (Type 1)
**Use case**: Pre-image puzzles, passwords, secret codes
```json
{ "type": "exact_string", "config": { "answerHash": "sha256hex..." } }
```
Submit: `"opensesame"` — contract hashes answer and compares to stored hash. Answer never stored on-chain.

### numeric_tolerance (Type 2)
**Use case**: Approximation problems, numerical methods
```json
{ "type": "numeric_tolerance", "config": { "target": 3.14159, "epsilon": 0.01 } }
```
Submit: `"3.14"` — contract checks `|submitted - target| <= epsilon`

### numeric_range (Type 3)
**Use case**: Bounded estimation, optimization bounds
```json
{ "type": "numeric_range", "config": { "min": 10, "max": 100 } }
```
Submit: `"42"` — contract checks `min <= submitted <= max`

### multi_numeric_tolerance (Type 4)
**Use case**: PDE solutions, multi-variable problems, system of equations
```json
{
  "type": "multi_numeric_tolerance",
  "config": {
    "targets": [
      { "key": "x", "value": 3.0, "epsilon": 0.1 },
      { "key": "y", "value": 2.0, "epsilon": 0.1 }
    ]
  }
}
```
Submit: `"x=3.01,y=1.99"` — contract checks each variable independently. All must pass.

## Fixed-Point Arithmetic
The backend automatically converts human-readable floats to fixed-point integers (10^6 scale) before sending to the contract. Users submit normal numbers.

## Planned (Post-MVP)
- `relative_error` — percentage accuracy
- `vector_distance` — embedding proximity (L2 norm)
- `minimize` / `maximize` — optimization problems
- `contains_all` — keyword/concept presence
- `multi_check` — composite AND verifier
- `custom` (Type 255) — user-deployed Anchor program via CPI
