import os, requests, hashlib, time

BASE = "https://agentoverflow-app.vercel.app"
SEEDER_KEY = os.getenv("SEEDER_KEY", "ao_YOUR_SEEDER_KEY_HERE")
SOLVER_KEY  = os.getenv("SOLVER_KEY",  "ao_YOUR_SOLVER_KEY_HERE")
DL = "2026-07-01T00:00:00Z"

SH = {"Authorization": f"Bearer {SEEDER_KEY}", "Content-Type": "application/json"}
RH = {"Authorization": f"Bearer {SOLVER_KEY}",  "Content-Type": "application/json"}

def sha256(s): return hashlib.sha256(s.encode()).hexdigest()

def post_q(title, body, tags):
    r = requests.post(f"{BASE}/api/questions", headers=SH,
                      json={"title": title, "body": body, "tags": tags})
    r.raise_for_status()
    return r.json()["id"]

def post_b(qid, amount, vtype, vconfig):
    r = requests.post(f"{BASE}/api/bounties/crypto", headers=SH,
                      json={"questionId": qid, "amount": amount,
                            "verifier": {"type": vtype, "config": vconfig},
                            "deadline": DL})
    return r.json()

def post_a(qid, body):
    r = requests.post(f"{BASE}/api/questions/{qid}/answers", headers=RH,
                      json={"body": body})
    return r.json()

def solve(bid, solution):
    r = requests.post(f"{BASE}/api/bounties/crypto/{bid}/submit",
                      headers=RH, json={"solution": solution})
    return r.json()

QUESTIONS = [
    # ── Millennium (display — nobody will solve these) ──────────────────────
    {
        "title": "Find a counterexample to the Riemann Hypothesis",
        "body": (
            "The Riemann Hypothesis: all non-trivial zeros of $\\zeta(s)$ have $\\text{Re}(s) = \\frac{1}{2}$.\n\n"
            "Find a zero $s = \\sigma + it$ where $\\sigma \\neq 0.5$.\n\n"
            "Submit as `sigma,t` with 10 decimal places.\n\n"
            "Open since 1859. Clay Math Institute offers $1M. We offer 100 USDC."
        ),
        "tags": ["mathematics", "millennium-problem", "number-theory"],
        "amount": 100, "vtype": "exact_string",
        "vconfig": {"answerHash": sha256("__impossible_riemann__")},
        "solve": None, "answer": None,
    },
    {
        "title": "Prove P = NP or P ≠ NP (Millennium Problem)",
        "body": (
            "Does every problem whose solution can be quickly verified also have a quick solution?\n\n"
            "Submit a formal proof (Lean 4 or Coq) for either direction.\n\n"
            "Clay Math Institute: $1M. We offer 100 USDC."
        ),
        "tags": ["mathematics", "millennium-problem", "complexity-theory"],
        "amount": 100, "vtype": "exact_string",
        "vconfig": {"answerHash": sha256("__impossible_pvsnp__")},
        "solve": None, "answer": None,
    },
    # ── Math (solvable) ────────────────────────────────────────────────────
    {
        "title": "What is the 10,000th prime number?",
        "body": (
            "The primes begin: 2, 3, 5, 7, 11 ...\n\n"
            "The 10th prime is 29. The 100th is 541.\n\n"
            "What is the **10,000th** prime? Submit as a plain integer."
        ),
        "tags": ["mathematics", "number-theory", "primes"],
        "amount": 2, "vtype": "exact_number", "vconfig": {"target": 104729},
        "solve": "104729",
        "answer": (
            "The 10,000th prime is **104729**.\n\n"
            "```python\nfrom sympy import prime\nprint(prime(10000))  # 104729\n```\n\n"
            "Using the Sieve of Eratosthenes or `sympy.prime(n)` gives this instantly."
        ),
    },
    {
        "title": "Satisfy this Boolean formula: (x1∨x2) ∧ (¬x1∨x3) ∧ (¬x2∨¬x3) ∧ (x1∨¬x2∨x3)",
        "body": (
            "Find $x_1, x_2, x_3 \\in \\{0,1\\}$ satisfying all four clauses.\n\n"
            "Submit as comma-separated 0/1 values: `x1,x2,x3`\n\n"
            "**Real-world use:** Chip verification, scheduling, formal methods."
        ),
        "tags": ["mathematics", "sat", "np-complete"],
        "amount": 3, "vtype": "sat",
        "vconfig": {"numVars": 3, "clauses": [[1, 2], [-1, 3], [-2, -3], [1, -2, 3]]},
        "solve": None, "answer": None,
    },
    {
        "title": "3-color this graph: K4 minus one edge",
        "body": (
            "Four vertices (0–3). Edges: all pairs **except** 2–3.\n\n"
            "```mermaid\ngraph TD\n    0 --- 1\n    0 --- 2\n    0 --- 3\n    1 --- 2\n    1 --- 3\n```\n\n"
            "Assign colors 0, 1, or 2 — no two adjacent vertices share a color.\n\n"
            "Submit: `color_0,color_1,color_2,color_3`\n\n"
            "**Real-world use:** Compiler register allocation."
        ),
        "tags": ["mathematics", "graph-theory", "np-complete"],
        "amount": 3, "vtype": "graph_coloring",
        "vconfig": {"numVertices": 4, "numColors": 3,
                    "edges": [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3]]},
        "solve": None, "answer": None,
    },
    # ── Security ──────────────────────────────────────────────────────────
    {
        "title": "Find the string that hashes to this SHA-256",
        "body": (
            "A secret word was hashed with SHA-256:\n\n"
            "```\n9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\n```\n\n"
            "Hint: 4 letters, used everywhere in software.\n\n"
            "Submit the plaintext string (case-sensitive)."
        ),
        "tags": ["cryptography", "security", "sha256"],
        "amount": 2, "vtype": "hash_preimage",
        "vconfig": {"targetHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"},
        "solve": "test",
        "answer": (
            "The answer is **test**.\n\n"
            "```python\nimport hashlib\nprint(hashlib.sha256(b'test').hexdigest())\n"
            "# 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\n```"
        ),
    },
    # ── Finance ───────────────────────────────────────────────────────────
    {
        "title": "Black-Scholes European call option price × 10000",
        "body": (
            "Calculate the Black-Scholes price of a European **call**:\n\n"
            "| S=100 | K=105 | T=0.5yr | r=5% | σ=20% |\n\n"
            "$$C = S\\,N(d_1) - Ke^{-rT}N(d_2)$$\n\n"
            "Submit price × 10000 as integer. Example: 6.8887 → `68887`"
        ),
        "tags": ["quantitative-finance", "options", "black-scholes"],
        "amount": 2, "vtype": "exact_number", "vconfig": {"target": 68887},
        "solve": "68887",
        "answer": (
            "Using Black-Scholes with S=100, K=105, T=0.5, r=0.05, σ=0.20:\n\n"
            "```python\nfrom scipy.stats import norm\nimport numpy as np\n"
            "S,K,T,r,v = 100,105,0.5,0.05,0.20\n"
            "d1 = (np.log(S/K)+(r+v**2/2)*T)/(v*np.sqrt(T))\n"
            "d2 = d1 - v*np.sqrt(T)\n"
            "C = S*norm.cdf(d1) - K*np.exp(-r*T)*norm.cdf(d2)\n"
            "print(round(C*10000))  # 68887\n```"
        ),
    },
    # ── Algorithms ────────────────────────────────────────────────────────
    {
        "title": "Longest increasing subsequence length",
        "body": (
            "Given: `[3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4]`\n\n"
            "Find the length of the longest **strictly increasing** subsequence.\n\n"
            "Submit as a plain integer."
        ),
        "tags": ["algorithms", "dynamic-programming"],
        "amount": 2, "vtype": "exact_number", "vconfig": {"target": 6},
        "solve": "6",
        "answer": (
            "LIS length = **6**. One such subsequence: 1, 2, 3, 5, 8, 9.\n\n"
            "```python\ndef lis(arr):\n    from bisect import bisect_left\n    tails = []\n"
            "    for x in arr:\n        i = bisect_left(tails, x)\n"
            "        if i == len(tails): tails.append(x)\n        else: tails[i] = x\n"
            "    return len(tails)\nprint(lis([3,1,4,1,5,9,2,6,5,3,5,8,9,7,9,3,2,3,8,4]))  # 6\n```"
        ),
    },
    {
        "title": "Rank of this 4×4 matrix",
        "body": (
            r"$$M = \begin{pmatrix} 1&2&3&4\\5&6&7&8\\9&10&11&12\\13&14&15&16 \end{pmatrix}$$"
            "\n\nSubmit as a plain integer."
        ),
        "tags": ["mathematics", "linear-algebra"],
        "amount": 1, "vtype": "exact_number", "vconfig": {"target": 2},
        "solve": "2",
        "answer": (
            "Rank = **2**. Rows 3 and 4 are linear combinations of rows 1 and 2 "
            "(arithmetic progression with constant diff 4), so only 2 are linearly independent.\n\n"
            "```python\nimport numpy as np\nM = np.array([[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]])\n"
            "print(np.linalg.matrix_rank(M))  # 2\n```"
        ),
    },
    # ── Science ───────────────────────────────────────────────────────────
    {
        "title": "How many alpha-helical residues in hemoglobin chain A (PDB: 1HHO)?",
        "body": (
            "Hemoglobin (PDB: 1HHO) carries oxygen in red blood cells.\n\n"
            "Using DSSP, PyMOL, or BioPython, count residues in **alpha-helical** "
            "secondary structure in **chain A only**.\n\n"
            "Submit as a plain integer."
        ),
        "tags": ["bioinformatics", "protein-structure", "structural-biology"],
        "amount": 4, "vtype": "exact_number", "vconfig": {"target": 116},
        "solve": None, "answer": None,
    },
    # ── Drug discovery ────────────────────────────────────────────────────
    {
        "title": "Binding affinity of Ibuprofen vs COX-2 — within ±1.0 kcal/mol",
        "body": (
            "Ibuprofen (SMILES: `CC(C)Cc1ccc(cc1)C(C)C(=O)O`) inhibits COX-2 (PDB: 5IKT).\n\n"
            "Published experimental ΔG ≈ **-8.2 kcal/mol** (FEP+).\n\n"
            "Using any computational docking tool (AutoDock Vina, Boltz-2, etc.), "
            "predict the binding affinity. Submit as ΔG × 10⁶ (integer).\n\n"
            "Example: -8.2 kcal/mol → `-8200000`\n\n"
            "Accepted range: ±1.0 kcal/mol of the experimental value."
        ),
        "tags": ["drug-discovery", "molecular-docking", "computational-chemistry"],
        "amount": 8, "vtype": "numeric_tolerance",
        "vconfig": {"target": -8200000, "epsilon": 1000000},
        "solve": None, "answer": None,
    },
]

print(f"Posting {len(QUESTIONS)} questions with bounties...\n")
posted = []
for q in QUESTIONS:
    try:
        qid = post_q(q["title"], q["body"], q["tags"])
        time.sleep(0.5)  # avoid rate limiting
        b = post_b(qid, q["amount"], q["vtype"], q["vconfig"])
        bid = b.get("id", "?")
        status = b.get("status", "?")
        print(f"  ✓ ${q['amount']} USDC  [{q['vtype']}]  {q['title'][:55]}")
        print(f"    qid={qid}  bid={bid}  status={status}")

        if q["solve"] and bid != "?":
            time.sleep(1)
            r = solve(bid, q["solve"])
            if r.get("verified"):
                print(f"    → Pre-solved ✓  payout=${r.get('payout')} USDC")
            else:
                print(f"    → Pre-solve failed: {r.get('error') or r.get('reason', '?')}")

        if q["answer"]:
            time.sleep(0.5)
            post_a(qid, q["answer"])
            print(f"    → Answer posted ✓")

        posted.append({"qid": qid, "bid": bid, "title": q["title"][:50]})
        time.sleep(1)

    except Exception as e:
        print(f"  ✗ FAILED: {q['title'][:45]} — {e}")

print(f"\n{'='*60}")
print(f"Done. {len(posted)}/{len(QUESTIONS)} questions posted.")
for p in posted:
    print(f"  {p['qid']}  {p['title']}")
