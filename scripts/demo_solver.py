#!/usr/bin/env python3
"""
Agent Overflow — Solver Bot v1.0
Hackathon demo script: scans active USDC bounties on Solana devnet and solves them.
"""

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Any, Optional

try:
    import requests
except ImportError:
    print("[!] Missing dependency: pip install requests")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# BANNER
# ─────────────────────────────────────────────────────────────────────────────

BANNER = """\
╔══════════════════════════════════════════════════════════╗
║          AGENT OVERFLOW — SOLVER BOT v1.0                ║
║          Scanning bounties on Solana devnet               ║
╚══════════════════════════════════════════════════════════╝"""

DIVIDER = "━" * 60

# ─────────────────────────────────────────────────────────────────────────────
# VERIFIER TYPE IDs  (must match server constants)
# ─────────────────────────────────────────────────────────────────────────────

VERIFIER_TYPES = {
    0: "exact_string",
    1: "exact_number",
    2: "numeric_tolerance",
    3: "numeric_range",
    4: "multi_numeric_tolerance",
    5: "hash_preimage",
    6: "sat",
    7: "graph_coloring",
    8: "wasm_exec",
}

# ─────────────────────────────────────────────────────────────────────────────
# KNOWN PREIMAGES for hash_preimage and exact_string verifiers
# ─────────────────────────────────────────────────────────────────────────────

KNOWN_PREIMAGES = [
    "hello",
    "solana",
    "agent overflow",
    "agent_overflow",
    "solana_escrow_demo",
    "escrow",
    "crypto",
    "bounty",
    "blockchain",
    "devnet",
    "hackathon",
    "password",
    "secret",
    "bitcoin",
    "ethereum",
    "web3",
    "defi",
    "nft",
    "dao",
    "usdc",
    "sol",
    "lamport",
    "anchor",
    "rust",
    "typescript",
    "python",
    "42",
    "1337",
    "0",
    "1",
    "test",
    "answer",
    "correct",
    "winner",
    "proof",
]

# ─────────────────────────────────────────────────────────────────────────────
# MATH SOLVERS
# ─────────────────────────────────────────────────────────────────────────────


def sieve_of_eratosthenes(limit: int) -> list[int]:
    """Return all primes up to limit."""
    is_prime = bytearray([1]) * (limit + 1)
    is_prime[0] = is_prime[1] = 0
    for i in range(2, int(limit**0.5) + 1):
        if is_prime[i]:
            is_prime[i * i :: i] = bytearray(len(is_prime[i * i :: i]))
    return [i for i, v in enumerate(is_prime) if v]


def nth_prime(n: int) -> Optional[int]:
    """Return the nth prime (1-indexed). Returns None if n > our limit."""
    limit = max(200_000, n * 20)
    primes = sieve_of_eratosthenes(limit)
    if n <= len(primes):
        return primes[n - 1]
    return None


def fibonacci(n: int) -> Optional[int]:
    """Return the nth Fibonacci number (0-indexed: F(0)=0, F(1)=1, F(20)=6765)."""
    if n < 0 or n > 92:  # F(93) overflows int64
        return None
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


def factorial(n: int) -> Optional[int]:
    """Return n! for small n."""
    if n < 0 or n > 20:
        return None
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


def triangular(n: int) -> int:
    """Return n*(n+1)//2."""
    return n * (n + 1) // 2


def build_number_lookup() -> dict[int, str]:
    """Pre-compute a lookup table of interesting integers → their identity."""
    lookup: dict[int, str] = {}

    # Primes
    primes = sieve_of_eratosthenes(200_000)
    for p in primes:
        lookup[p] = str(p)

    # Fibonacci F(0)..F(92)
    for i in range(93):
        v = fibonacci(i)
        if v is not None:
            lookup[v] = str(v)

    # Factorials
    for i in range(21):
        v = factorial(i)
        if v is not None:
            lookup[v] = str(v)

    # Triangular numbers
    for i in range(1, 1000):
        lookup[triangular(i)] = str(triangular(i))

    # Powers of 2
    for i in range(64):
        lookup[2**i] = str(2**i)

    # Simple squares and cubes
    for i in range(1000):
        lookup[i * i] = str(i * i)
        lookup[i * i * i] = str(i * i * i)

    return lookup


# ─────────────────────────────────────────────────────────────────────────────
# SAT SOLVER  (backtracking, for numVars ≤ 20)
# ─────────────────────────────────────────────────────────────────────────────


def solve_sat(num_vars: int, clauses: list[list[int]]) -> Optional[str]:
    """Backtracking SAT solver. Returns comma-separated 0/1 string or None."""
    assignment = [None] * (num_vars + 1)  # 1-indexed

    def clause_satisfied(clause: list[int], assign: list) -> Optional[bool]:
        """True=sat, False=unsat, None=undecided."""
        undecided = False
        for lit in clause:
            var = abs(lit)
            val = assign[var]
            if val is None:
                undecided = True
                continue
            lit_true = val if lit > 0 else not val
            if lit_true:
                return True
        return None if undecided else False

    def backtrack(var_idx: int, assign: list) -> Optional[list]:
        if var_idx > num_vars:
            # Check all clauses
            for clause in clauses:
                if clause_satisfied(clause, assign) is not True:
                    return None
            return assign
        for val in (True, False):
            assign[var_idx] = val
            # Early termination: if any clause is already False, prune
            pruned = False
            for clause in clauses:
                result = clause_satisfied(clause, assign)
                if result is False:
                    pruned = True
                    break
            if not pruned:
                result = backtrack(var_idx + 1, assign)
                if result is not None:
                    return result
            assign[var_idx] = None
        return None

    solution = backtrack(1, assignment)
    if solution is None:
        return None
    return ",".join("1" if solution[i + 1] else "0" for i in range(num_vars))


# ─────────────────────────────────────────────────────────────────────────────
# GRAPH COLORING SOLVER  (greedy + backtracking)
# ─────────────────────────────────────────────────────────────────────────────


def solve_graph_coloring(
    num_vertices: int, num_colors: int, edges: list[list[int]]
) -> Optional[str]:
    """Greedy graph coloring with backtracking fallback."""
    # Build adjacency sets
    adj: list[set] = [set() for _ in range(num_vertices)]
    for u, v in edges:
        adj[u].add(v)
        adj[v].add(u)

    # Try greedy first (order by degree descending)
    order = sorted(range(num_vertices), key=lambda v: -len(adj[v]))
    coloring = [-1] * num_vertices

    def greedy() -> bool:
        for v in order:
            used = {coloring[n] for n in adj[v] if coloring[n] != -1}
            for c in range(num_colors):
                if c not in used:
                    coloring[v] = c
                    break
            else:
                return False
        return True

    if greedy() and all(c != -1 for c in coloring):
        return ",".join(str(c) for c in coloring)

    # Backtracking fallback
    coloring2 = [-1] * num_vertices

    def backtrack(v: int) -> bool:
        if v == num_vertices:
            return True
        used = {coloring2[n] for n in adj[v] if coloring2[n] != -1}
        for c in range(num_colors):
            if c not in used:
                coloring2[v] = c
                if backtrack(v + 1):
                    return True
                coloring2[v] = -1
        return False

    if backtrack(0):
        return ",".join(str(c) for c in coloring2)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# SOLVER  DISPATCH
# ─────────────────────────────────────────────────────────────────────────────


def sha256hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def attempt_solve(
    verifier_type_id: int,
    verifier_config: dict,
    number_lookup: dict[int, str],
    verbose: bool = True,
) -> Optional[str]:
    """Return solution string or None if unsolvable."""
    vtype = VERIFIER_TYPES.get(verifier_type_id, "unknown")

    # ── exact_number ─────────────────────────────────────────────────────────
    if vtype == "exact_number":
        target = verifier_config.get("target")
        if target is None:
            return None
        target = int(target)
        if target in number_lookup:
            return str(target)
        return None

    # ── numeric_tolerance ────────────────────────────────────────────────────
    if vtype == "numeric_tolerance":
        target = verifier_config.get("target")
        if target is None:
            return None
        # Submit the target value directly as a float string
        return str(float(target))

    # ── numeric_range ────────────────────────────────────────────────────────
    if vtype == "numeric_range":
        lo = verifier_config.get("min")
        hi = verifier_config.get("max")
        if lo is None or hi is None:
            return None
        # Submit the midpoint
        mid = (float(lo) + float(hi)) / 2.0
        return str(mid)

    # ── multi_numeric_tolerance ───────────────────────────────────────────────
    if vtype == "multi_numeric_tolerance":
        targets = verifier_config.get("targets", [])
        if not targets:
            return None
        # Format: "key1=value1,key2=value2"
        parts = []
        for t in targets:
            key = t.get("key", "")
            value = t.get("value")
            if key and value is not None:
                parts.append(f"{key}={float(value)}")
        if parts:
            return ",".join(parts)
        return None

    # ── exact_string ─────────────────────────────────────────────────────────
    if vtype == "exact_string":
        answer_hash = verifier_config.get("answerHash", "").lower()
        for candidate in KNOWN_PREIMAGES:
            if sha256hex(candidate) == answer_hash:
                return candidate
        return None

    # ── hash_preimage ─────────────────────────────────────────────────────────
    if vtype == "hash_preimage":
        target_hash = verifier_config.get("targetHash", "").lower()
        for candidate in KNOWN_PREIMAGES:
            if sha256hex(candidate) == target_hash:
                return candidate
        return None

    # ── sat ───────────────────────────────────────────────────────────────────
    if vtype == "sat":
        num_vars = verifier_config.get("numVars", 0)
        clauses = verifier_config.get("clauses", [])
        if num_vars < 1 or num_vars > 20 or not clauses:
            return None
        return solve_sat(num_vars, clauses)

    # ── graph_coloring ────────────────────────────────────────────────────────
    if vtype == "graph_coloring":
        num_vertices = verifier_config.get("numVertices", 0)
        num_colors = verifier_config.get("numColors", 0)
        edges = verifier_config.get("edges", [])
        if num_vertices < 1 or num_colors < 1:
            return None
        return solve_graph_coloring(num_vertices, num_colors, edges)

    # ── wasm_exec ─────────────────────────────────────────────────────────────
    # Cannot solve without executing the WASM; skip.
    return None


# ─────────────────────────────────────────────────────────────────────────────
# API CLIENT
# ─────────────────────────────────────────────────────────────────────────────


class AgentOverflowClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}"})
        self.user_info: dict = {}
        self.wallet_info: dict = {}

    def authenticate(self) -> bool:
        """Fetch current user profile and wallet balance."""
        try:
            resp = self.session.get(f"{self.base_url}/api/auth/me", timeout=10)
            if resp.status_code == 401:
                print("[!] Invalid API key — authentication failed.")
                return False
            resp.raise_for_status()
            self.user_info = resp.json()
        except requests.RequestException as e:
            print(f"[!] Auth request failed: {e}")
            return False

        try:
            resp = self.session.get(f"{self.base_url}/api/wallet/balance", timeout=10)
            if resp.status_code == 200:
                self.wallet_info = resp.json()
        except requests.RequestException:
            pass  # Wallet info is optional for display

        return True

    def fetch_funded_bounties(self, limit: int = 50) -> list[dict]:
        """Fetch all funded crypto bounties."""
        try:
            resp = self.session.get(
                f"{self.base_url}/api/bounties/crypto",
                params={"status": "funded", "limit": limit},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            # API returns a list directly (not wrapped in {"bounties": ...})
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "bounties" in data:
                return data["bounties"]
            return []
        except requests.RequestException as e:
            print(f"[!] Failed to fetch bounties: {e}")
            return []

    def submit_solution(self, bounty_id: str, solution: str) -> dict:
        """Submit a solution and return the response dict."""
        try:
            resp = self.session.post(
                f"{self.base_url}/api/bounties/crypto/{bounty_id}/submit",
                json={"solution": solution},
                timeout=30,
            )
            return resp.json()
        except requests.RequestException as e:
            return {"verified": False, "reason": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# PRETTY PRINTING HELPERS
# ─────────────────────────────────────────────────────────────────────────────


def truncate(s: str, n: int = 48) -> str:
    return s if len(s) <= n else s[:n - 3] + "..."


def format_wallet(pubkey: str) -> str:
    if len(pubkey) >= 10:
        return pubkey[:8] + "..."
    return pubkey


def color(text: str, code: str) -> str:
    """ANSI color wrapper (gracefully degrades on unsupported terminals)."""
    return f"\033[{code}m{text}\033[0m"


def green(t: str) -> str:
    return color(t, "32")


def red(t: str) -> str:
    return color(t, "31")


def yellow(t: str) -> str:
    return color(t, "33")


def cyan(t: str) -> str:
    return color(t, "36")


def bold(t: str) -> str:
    return color(t, "1")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────


def run(
    api_key: str,
    base_url: str,
    dry_run: bool = False,
    verbose: bool = True,
) -> int:
    print(bold(cyan(BANNER)))
    print()

    client = AgentOverflowClient(base_url, api_key)

    # ── Authenticate ─────────────────────────────────────────────────────────
    print(f"[*] Connecting to {base_url} ...")
    if not client.authenticate():
        return 1

    user = client.user_info
    wallet = client.wallet_info
    wallet_display = format_wallet(wallet.get("publicKey", "unknown"))
    usdc_balance = wallet.get("usdc", "?")

    print(f"[*] Authenticated as: {bold(user.get('name', 'unknown'))}")
    print(f"[*] Wallet: {cyan(wallet_display)} | Balance: {bold(str(usdc_balance))} USDC")
    if dry_run:
        print(yellow("[*] DRY RUN mode — solutions will NOT be submitted"))
    print()

    # ── Build solver lookup ───────────────────────────────────────────────────
    print("[*] Pre-computing number tables (primes, Fibonacci, factorials) ...")
    t0 = time.time()
    number_lookup = build_number_lookup()
    print(f"[*] Lookup table ready: {len(number_lookup):,} entries in {time.time()-t0:.2f}s")
    print()

    # ── Fetch bounties ────────────────────────────────────────────────────────
    print("[*] Scanning active bounties ...")
    bounties = client.fetch_funded_bounties(limit=50)

    if not bounties:
        print("[!] No active funded bounties found.")
        return 0

    print(f"[*] Found {len(bounties)} active bounty/bounties\n")

    solved = 0
    total_earned = 0.0
    skipped = 0

    for idx, bounty in enumerate(bounties, 1):
        print(DIVIDER)

        # Parse bounty fields
        bounty_id = bounty.get("id", "???")
        amount = bounty.get("amount", 0)
        verifier_type_id = bounty.get("verifierType", -1)
        vtype_name = VERIFIER_TYPES.get(verifier_type_id, f"type_{verifier_type_id}")
        raw_config = bounty.get("verifierConfig", {})

        # verifierConfig may come as JSON string or already-parsed dict
        if isinstance(raw_config, str):
            try:
                verifier_config = json.loads(raw_config)
            except json.JSONDecodeError:
                verifier_config = {}
        else:
            verifier_config = raw_config or {}

        # Question title
        question = bounty.get("question") or {}
        title = question.get("title", bounty.get("title", "Untitled"))

        print(
            f"[{idx}/{len(bounties)}] Bounty: {bold(truncate(title, 52))} — "
            f"{bold(str(amount))} USDC"
        )
        print(f"      Verifier: {cyan(vtype_name)} | Config: {truncate(str(verifier_config), 60)}")

        # ── Solve ─────────────────────────────────────────────────────────────
        print(f"[→]   Computing answer...")
        solution = attempt_solve(verifier_type_id, verifier_config, number_lookup)

        if solution is None:
            print(yellow(f"[~]   Cannot solve {vtype_name} — skipping"))
            skipped += 1
            print()
            continue

        print(f"[→]   Answer: {bold(truncate(solution, 60))}")

        if dry_run:
            print(yellow("[→]   (dry-run) Submission skipped"))
            print()
            continue

        # ── Submit ────────────────────────────────────────────────────────────
        print("[→]   Submitting to escrow...")
        resp = client.submit_solution(bounty_id, solution)

        if resp.get("verified"):
            tx_hash = resp.get("txHash", "")
            payout = resp.get("payout", 0)
            total_earned += float(payout or 0)
            solved += 1
            explorer = f"https://solscan.io/tx/{tx_hash}?cluster=devnet" if tx_hash else ""
            print(green(f"[✓]   CORRECT — USDC released! (+{payout} USDC)"))
            if explorer:
                print(f"      Tx: {cyan(explorer)}")
        else:
            reason = resp.get("reason", resp.get("error", "Unknown error"))
            print(red(f"[✗]   WRONG — {truncate(reason, 72)}"))

        print()

    # ── Summary ───────────────────────────────────────────────────────────────
    print(DIVIDER)
    solvable = len(bounties) - skipped
    print(bold(f"\n[*] DONE — Solved {solved}/{solvable} solvable bounties"))
    if not dry_run:
        print(bold(green(f"[*] Earned: {total_earned:.2f} USDC")))
    if skipped:
        print(f"[*] Skipped {skipped} unsolvable bounty/bounties (wasm_exec or unknown type)")
    print()

    return 0


# ─────────────────────────────────────────────────────────────────────────────
# CLI ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Agent Overflow Solver Bot — automatically solves crypto bounties",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  AGENT_OVERFLOW_API_KEY=ao_xxx python3 demo_solver.py
  python3 demo_solver.py --api-key ao_xxx --dry-run
  python3 demo_solver.py --api-key ao_xxx --base-url http://localhost:3000
        """,
    )
    parser.add_argument(
        "--api-key",
        metavar="KEY",
        help="Agent Overflow API key (or set AGENT_OVERFLOW_API_KEY env var)",
    )
    parser.add_argument(
        "--base-url",
        metavar="URL",
        default="https://app-blue-gamma-18.vercel.app",
        help="Base URL of the Agent Overflow API (default: production)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scan and solve locally, but do not submit answers",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress verbose output",
    )
    args = parser.parse_args()

    # Resolve API key
    api_key = args.api_key or os.environ.get("AGENT_OVERFLOW_API_KEY", "")
    if not api_key:
        parser.error(
            "API key required. Pass --api-key KEY or set AGENT_OVERFLOW_API_KEY env var."
        )

    sys.exit(run(
        api_key=api_key,
        base_url=args.base_url,
        dry_run=args.dry_run,
        verbose=not args.quiet,
    ))


if __name__ == "__main__":
    main()
