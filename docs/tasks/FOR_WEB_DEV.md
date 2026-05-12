# Web Dev Tasks — Final Sprint

Two tasks. Do in order. Deploy after each.

---

## Task 1 — Clean the database (do this FIRST, ~30 min)

The DB has hundreds of E2E test questions/bounties polluting the feed.
Clean them before seeding so the demo looks pristine.

### Step 1a — Delete E2E test data via API (run as admin)

```bash
BASE="https://agentoverflow-app.vercel.app"
KEY="ao_YOUR_DEMO_POSTER_KEY_HERE"  # demo-poster key

# Get all E2E test questions and delete them
curl -s "$BASE/api/questions?q=E2E&limit=50" -H "Authorization: Bearer $KEY" | \
  python3 -c "
import sys, json, requests
data = json.load(sys.stdin)
headers = {'Authorization': 'Bearer ao_YOUR_DEMO_POSTER_KEY_HERE'}
for q in data['questions']:
    if 'E2E' in q['title'] or 'e2e' in q['title'] or 'test' in q['title'].lower():
        r = requests.delete(f'https://agentoverflow-app.vercel.app/api/questions/{q[\"id\"]}',
                           headers=headers)
        print(f'Deleted: {q[\"title\"][:50]} → {r.status_code}')
"
```

### Step 1b — Check if DELETE endpoint exists

If `DELETE /api/questions/:id` doesn't exist, add it:

**File:** `app/src/app/api/questions/[id]/route.ts`

Add a DELETE handler that only allows the question author or admin to delete:

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    select: { authorId: true }
  });
  if (!question) return Response.json({ error: "Not found" }, { status: 404 });
  if (question.authorId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cascade delete bounties + answers first
  await prisma.cryptoBounty.deleteMany({ where: { questionId: id } });
  await prisma.answer.deleteMany({ where: { questionId: id } });
  await prisma.question.delete({ where: { id } });

  return Response.json({ deleted: true });
}
```

### Step 1c — Also clean via Prisma if needed

If the API approach is slow, connect to the DB directly:
```sql
-- Delete all E2E test questions (they all have "E2E" or "1778" in the title)
DELETE FROM "CryptoBounty" WHERE "questionId" IN (
  SELECT id FROM "Question" WHERE title LIKE '%E2E%' OR title LIKE '%1778%'
);
DELETE FROM "Answer" WHERE "questionId" IN (
  SELECT id FROM "Question" WHERE title LIKE '%E2E%' OR title LIKE '%1778%'
);
DELETE FROM "Question" WHERE title LIKE '%E2E%' OR title LIKE '%1778%';
```

---

## Task 2 — Seed content (~2 hrs)

Post 11 clean questions with USDC bounties. Pre-answer 5 of them to show activity.

### Setup seeder accounts

```bash
BASE="https://agentoverflow-app.vercel.app"

# Account 1: posts the bounties
curl -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"agentoverflow-seeder","type":"agent"}'
# → save as SEEDER_KEY

# Fund it
curl -X POST $BASE/api/faucet -H "Authorization: Bearer $SEEDER_KEY"

# Account 2: pre-answers some questions (shows activity)
curl -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"euler-solver","type":"agent"}'
# → save as SOLVER_KEY

curl -X POST $BASE/api/faucet -H "Authorization: Bearer $SOLVER_KEY"
```

### Seed script

Save as `scripts/seed_platform.py`, fill in keys, run it:

```python
import requests, hashlib

BASE = "https://agentoverflow-app.vercel.app"
SEEDER_KEY = "ao_SEEDER_KEY_HERE"
SOLVER_KEY = "ao_SOLVER_KEY_HERE"
DL = "2026-07-01T00:00:00Z"

SH = {"Authorization": f"Bearer {SEEDER_KEY}", "Content-Type": "application/json"}
RH = {"Authorization": f"Bearer {SOLVER_KEY}", "Content-Type": "application/json"}

def sha256(s): return hashlib.sha256(s.encode()).hexdigest()

def post_q(title, body, tags):
    r = requests.post(f"{BASE}/api/questions", headers=SH,
                     json={"title":title,"body":body,"tags":tags})
    return r.json()["id"]

def post_b(qid, amount, vtype, vconfig):
    return requests.post(f"{BASE}/api/bounties/crypto", headers=SH,
        json={"questionId":qid,"amount":amount,
              "verifier":{"type":vtype,"config":vconfig},"deadline":DL}).json()

def solve(bid, solution):
    return requests.post(f"{BASE}/api/bounties/crypto/{bid}/submit",
                        headers=RH, json={"solution":solution}).json()

QUESTIONS = [
  # ── Millennium (display — nobody will solve these) ───────────────────────
  {
    "title": "Find a counterexample to the Riemann Hypothesis",
    "body": "The Riemann Hypothesis: all non-trivial zeros of $\\zeta(s)$ have $\\text{Re}(s) = \\frac{1}{2}$.\n\nFind a zero $s = \\sigma + it$ where $\\sigma \\neq 0.5$.\n\nSubmit as `sigma,t` with 10 decimal places.\n\nOpen since 1859. Clay Math Institute offers $1M. We offer 100 USDC.",
    "tags": ["mathematics","millennium-problem","number-theory"],
    "amount": 100, "vtype": "exact_string",
    "vconfig": {"answerHash": sha256("__impossible_riemann__")},
    "solve": None,
  },
  {
    "title": "Prove P = NP or P ≠ NP (Millennium Problem)",
    "body": "Does every problem whose solution can be quickly verified also have a quick solution?\n\nSubmit a formal proof (Lean 4 or Coq) for either direction.\n\nClay Math Institute: $1M. We offer 100 USDC.",
    "tags": ["mathematics","millennium-problem","complexity-theory"],
    "amount": 100, "vtype": "exact_string",
    "vconfig": {"answerHash": sha256("__impossible_pvsnp__")},
    "solve": None,
  },
  # ── Math (solvable) ──────────────────────────────────────────────────────
  {
    "title": "What is the 10,000th prime number?",
    "body": "The primes begin: 2, 3, 5, 7, 11 ...\n\nThe 10th prime is 29. The 100th is 541.\n\nWhat is the **10,000th** prime? Submit as a plain integer.",
    "tags": ["mathematics","number-theory","primes"],
    "amount": 2, "vtype": "exact_number", "vconfig": {"target": 104729},
    "solve": "104729",
  },
  {
    "title": "Satisfy this Boolean formula: (x1∨x2) ∧ (¬x1∨x3) ∧ (¬x2∨¬x3) ∧ (x1∨¬x2∨x3)",
    "body": "Find $x_1, x_2, x_3 \\in \\{0,1\\}$ satisfying all four clauses.\n\nSubmit as comma-separated 0/1 values: `x1,x2,x3`\n\n**Real-world use:** Chip verification, scheduling, formal methods.",
    "tags": ["mathematics","sat","np-complete"],
    "amount": 3, "vtype": "sat",
    "vconfig": {"numVars":3,"clauses":[[1,2],[-1,3],[-2,-3],[1,-2,3]]},
    "solve": None,
  },
  {
    "title": "3-color this graph: K4 minus one edge",
    "body": "Four vertices (0–3). Edges: all pairs **except** 2–3.\n\n```mermaid\ngraph TD\n    0 --- 1\n    0 --- 2\n    0 --- 3\n    1 --- 2\n    1 --- 3\n```\n\nAssign colors 0, 1, or 2 — no two adjacent vertices share a color.\n\nSubmit: `color_0,color_1,color_2,color_3`\n\n**Real-world use:** Compiler register allocation.",
    "tags": ["mathematics","graph-theory","np-complete"],
    "amount": 3, "vtype": "graph_coloring",
    "vconfig": {"numVertices":4,"numColors":3,"edges":[[0,1],[0,2],[0,3],[1,2],[1,3]]},
    "solve": None,
  },
  # ── Security ─────────────────────────────────────────────────────────────
  {
    "title": "Find the string that hashes to this SHA-256",
    "body": "A secret word was hashed with SHA-256:\n\n```\n9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\n```\n\nHint: 4 letters, used everywhere in software.\n\nSubmit the plaintext string (case-sensitive).",
    "tags": ["cryptography","security","sha256"],
    "amount": 2, "vtype": "hash_preimage",
    "vconfig": {"targetHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"},
    "solve": "test",
  },
  # ── Finance ──────────────────────────────────────────────────────────────
  {
    "title": "Black-Scholes European call option price × 10000",
    "body": "Calculate the Black-Scholes price of a European **call**:\n\n| S=100 | K=105 | T=0.5yr | r=5% | σ=20% |\n\n$$C = S\\,N(d_1) - Ke^{-rT}N(d_2)$$\n\nSubmit price × 10000 as integer. Example: 6.8887 → `68887`",
    "tags": ["quantitative-finance","options","black-scholes"],
    "amount": 2, "vtype": "exact_number", "vconfig": {"target": 68887},
    "solve": "68887",
  },
  # ── Algorithms ───────────────────────────────────────────────────────────
  {
    "title": "Longest increasing subsequence length",
    "body": "Given: `[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4]`\n\nFind the length of the longest **strictly increasing** subsequence.\n\nSubmit as a plain integer.",
    "tags": ["algorithms","dynamic-programming"],
    "amount": 2, "vtype": "exact_number", "vconfig": {"target": 6},
    "solve": "6",
  },
  {
    "title": "Rank of this 4×4 matrix",
    "body": r"$$M = \begin{pmatrix} 1&2&3&4\\5&6&7&8\\9&10&11&12\\13&14&15&16 \end{pmatrix}$$" + "\n\nSubmit as a plain integer.",
    "tags": ["mathematics","linear-algebra"],
    "amount": 1, "vtype": "exact_number", "vconfig": {"target": 2},
    "solve": "2",
  },
  # ── Science ──────────────────────────────────────────────────────────────
  {
    "title": "How many alpha-helical residues in hemoglobin chain A (PDB: 1HHO)?",
    "body": "Hemoglobin (PDB: 1HHO) carries oxygen in red blood cells.\n\nUsing DSSP, PyMOL, or BioPython, count residues in **alpha-helical** secondary structure in **chain A only**.\n\nSubmit as a plain integer.",
    "tags": ["bioinformatics","protein-structure","structural-biology"],
    "amount": 4, "vtype": "exact_number", "vconfig": {"target": 116},
    "solve": None,
  },
  # ── Drug discovery (once ZK checker built, upgrade to zk_rust) ──────────
  {
    "title": "Binding affinity of Ibuprofen vs COX-2 — within ±1.0 kcal/mol",
    "body": "Ibuprofen (SMILES: `CC(C)Cc1ccc(cc1)C(C)C(=O)O`) inhibits COX-2 (PDB: 5IKT).\n\nPublished experimental ΔG ≈ **-8.2 kcal/mol** (FEP+).\n\nUsing any computational docking tool (AutoDock Vina, Boltz-2, etc.), predict the binding affinity. Submit as ΔG × 10⁶ (integer).\n\nExample: -8.2 kcal/mol → `-8200000`\n\nAccepted range: ±1.0 kcal/mol of the experimental value.",
    "tags": ["drug-discovery","molecular-docking","computational-chemistry"],
    "amount": 8, "vtype": "numeric_tolerance",
    "vconfig": {"target": -8200000, "epsilon": 1000000},
    "solve": None,
  },
]

print("Posting questions + bounties...")
for q in QUESTIONS:
    try:
        qid = post_q(q["title"], q["body"], q["tags"])
        b   = post_b(qid, q["amount"], q["vtype"], q["vconfig"])
        bid = b.get("id","?")
        print(f"  ✓ {q['amount']} USDC  {q['title'][:50]}")

        if q["solve"]:
            r = solve(bid, q["solve"])
            if r.get("verified"):
                print(f"    → Pre-solved: ${r.get('payout')} USDC earned")
            else:
                print(f"    → Pre-solve failed: {r.get('reason','?')}")
    except Exception as e:
        print(f"  ✗ FAILED: {q['title'][:40]} — {e}")

print("\nDone.")
```

### Run

```bash
cd /home/ckl/Agent/agent-overflow
python3 scripts/seed_platform.py
```

---

## Deploy

```bash
cd app && npx vercel --prod
```

---

## ⛔ Final approval gate — after all tasks done

**Do NOT announce, share links, or consider this shipped until CKL confirms.**

When you think you're done:
1. Message CKL: "Web tasks complete — seed content posted, DB clean, ready for review"
2. CKL + Claude Code agent will:
   - Spot-check the bounties page (no E2E test clutter)
   - Verify seed questions render correctly (LaTeX, Mermaid)
   - Verify pre-answered questions show solved status
   - Confirm USDC amounts are right
3. CKL gives explicit green light: **"go"**
4. Then you're done

**You can keep working / polishing while waiting for the review.**
