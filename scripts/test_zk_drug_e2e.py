#!/usr/bin/env python3
"""
E2E test for ZK Drug Scoring bounties on Agent Overflow.

Flow:
  1. Register two test agents (asker + answerer)
  2. Asker creates a zk_rust bounty with the drug-scoring vkey_hash
  3. Answerer generates a Groth16 proof for Nirmatrelvir vs MPRO
  4. Answerer submits the proof
  5. Verify the bounty is awarded and on-chain

Usage:
  python3 scripts/test_zk_drug_e2e.py
  python3 scripts/test_zk_drug_e2e.py --base-url http://localhost:3000
  python3 scripts/test_zk_drug_e2e.py --proof-json /tmp/nirmatrelvir_proof.json  # skip proof gen
"""

import argparse, base64, json, os, subprocess, sys, time, hashlib, uuid
from pathlib import Path

import requests

BASE = Path(__file__).parent.parent
ZK_DIR = BASE / "zk-checkers/mpro-vina"
ELF = ZK_DIR / "sp1_program/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/mpro-vina-sp1"
PROVER = ZK_DIR / "prover/target/debug/mpro-vina-prover"
PREPARE_PY = ZK_DIR / "prover/prepare_input.py"
DOCKED_PDBQT = ZK_DIR / "test_molecules/nirmatrelvir_docked.pdbqt"

# vkey_hash of the compiled mpro-vina-sp1 ELF
VKEY_HASH = "0x0030eaf5984b6343df508ac0a15bb0e4d921b2102643317e0e60c70fa339a23d"

log = lambda msg: print(f"[e2e] {msg}", flush=True)


def api(session, base_url, method, path, **kwargs):
    r = getattr(session, method)(f"{base_url}{path}", timeout=30, **kwargs)
    if not r.ok:
        log(f"  ERROR {r.status_code}: {r.text[:300]}")
        r.raise_for_status()
    return r.json()


def register_agent(base_url, name):
    """Register a test agent and return API key."""
    uid = int(time.time() * 1000)
    agent_name = f"zk-drug-{name}-{uid}"
    r = requests.post(f"{base_url}/api/auth/register",
                      json={"name": agent_name, "type": "agent"},
                      timeout=15)
    if not r.ok:
        log(f"  Register failed for {name}: {r.text[:200]}")
        r.raise_for_status()
    return r.json().get("apiKey", "")


def fund_wallet(base_url, api_key):
    """Call /api/faucet to get devnet SOL + USDC."""
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {api_key}"
    try:
        r = s.post(f"{base_url}/api/faucet", json={}, timeout=30)
        if r.ok:
            data = r.json()
            log(f"  Faucet: SOL tx={data.get('solTxHash','?')[:16]}... USDC tx={data.get('usdcTxHash','?')[:16]}...")
            return True
        elif r.status_code == 429:
            log("  Faucet cooldown — wallet may already have funds")
            return True
        else:
            log(f"  Faucet failed {r.status_code}: {r.text[:100]}")
    except Exception as e:
        log(f"  Faucet error: {e}")
    return False


def create_question(session, base_url):
    """Create a question and return its ID."""
    ts = int(time.time())
    r = session.post(f"{base_url}/api/questions",
                     json={
                         "title": f"Drug scoring: prove your molecule binds to MPRO [{ts}]",
                         "body": "Submit a ZK proof that your molecule achieves a Vina score "
                                 "< -7.5 kcal/mol against the SARS-CoV-2 main protease (MPRO). "
                                 "Use the mpro-vina SP1 checker ELF. "
                                 f"vkey_hash={VKEY_HASH}",
                         "tags": ["drug-discovery", "zk-proof", "molecular-docking"],
                     },
                     timeout=30)
    if not r.ok:
        log(f"  Question create failed: {r.status_code} {r.text[:200]}")
        r.raise_for_status()
    data = r.json()
    return data.get("id") or data.get("questionId") or data.get("question", {}).get("id")


def create_drug_bounty(session, base_url, question_id, amount_usdc=2.0, deadline_hours=2):
    """Create a zk_rust bounty for MPRO drug scoring."""
    import time as t
    deadline = t.strftime("%Y-%m-%dT%H:%M:%SZ",
                          t.gmtime(t.time() + deadline_hours * 3600))
    payload = {
        "questionId":  question_id,
        "amount":      amount_usdc,
        "deadline":    deadline,
        "verifier": {
            "type": "zk_rust",
            "config": {
                "vkeyHash":    VKEY_HASH,
                "description": "Prove your molecule binds to MPRO (SARS-CoV-2 main protease) "
                               f"with Vina score < -7.5 kcal/mol. vkeyHash={VKEY_HASH}",
            },
        },
    }
    return api(session, base_url, "post", "/api/bounties/crypto", json=payload)



def generate_proof(mock=False):
    """Generate Groth16 proof for Nirmatrelvir vs MPRO. Returns proof dict."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        input_path = f.name
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        proof_path = f.name

    subprocess.run(
        [sys.executable, str(PREPARE_PY), str(DOCKED_PDBQT), "--problem", "0", "-o", input_path],
        check=True
    )
    cmd = [str(PROVER), str(ELF), input_path, "-o", proof_path]
    if mock:
        cmd.append("--mock")
    log(f"Running {'mock' if mock else 'Groth16'} prover...")
    subprocess.run(cmd, check=True)
    with open(proof_path) as f:
        proof = json.load(f)
    os.unlink(input_path)
    os.unlink(proof_path)
    return proof


def submit_drug_proof(session, base_url, bounty_id, proof):
    """Submit ZK proof via the API. Route expects base64 strings."""
    payload = {
        "proof":        proof["proof_b64"],
        "publicValues": proof["public_values_b64"],
    }
    return api(session, base_url, "post",
               f"/api/bounties/crypto/{bounty_id}/submit", json=payload)


def wait_for_award(session, base_url, bounty_id, timeout=120):
    """Poll until bounty status == 'awarded' or timeout."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            data = api(session, base_url, "get", f"/api/bounties/crypto/{bounty_id}")
            status = data.get("status", "unknown")
            log(f"  Bounty status: {status}")
            if status == "awarded":
                return True
            if status in ("failed", "expired", "refunded"):
                return False
        except Exception:
            pass
        time.sleep(5)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="https://agent-overflow.vercel.app")
    ap.add_argument("--proof-json", help="Skip proof generation and use this proof file")
    ap.add_argument("--mock", action="store_true", help="Use mock proof (not valid on-chain)")
    ap.add_argument("--amount", type=float, default=2.0, help="Bounty amount in USDC")
    args = ap.parse_args()

    base_url = args.base_url.rstrip("/")
    log(f"Base URL: {base_url}")
    log(f"ELF: {ELF}")
    log(f"vkey_hash: {VKEY_HASH}")
    print()

    # ── 1. Register agents ─────────────────────────────────────────────────
    log("1. Registering test agents...")
    asker_key    = register_agent(base_url, "asker")
    answerer_key = register_agent(base_url, "answerer")
    log(f"   asker    key: {asker_key[:20]}...")
    log(f"   answerer key: {answerer_key[:20]}...")

    asker    = requests.Session()
    answerer = requests.Session()
    asker.headers["Authorization"]    = f"Bearer {asker_key}"
    answerer.headers["Authorization"] = f"Bearer {answerer_key}"

    fund_wallet(base_url, asker_key)
    fund_wallet(base_url, answerer_key)
    log("   Waiting 8s for faucet txs to propagate...")
    time.sleep(8)

    # ── 2. Create question + bounty ────────────────────────────────────────
    log(f"\n2. Creating question + zk_rust drug-scoring bounty ({args.amount} USDC)...")
    question_id = create_question(asker, base_url)
    log(f"   Question ID: {question_id}")
    bounty = create_drug_bounty(asker, base_url, question_id, amount_usdc=args.amount)
    bounty_id = bounty.get("id", bounty.get("bountyId", ""))
    log(f"   Bounty ID: {bounty_id}")
    log(f"   Status:    {bounty.get('status', '?')}")

    if not bounty_id:
        log("ERROR: no bounty ID returned")
        sys.exit(1)

    # ── 3. Get/generate proof ──────────────────────────────────────────────
    log(f"\n3. {'Loading' if args.proof_json else 'Generating'} Groth16 proof...")
    if args.proof_json:
        with open(args.proof_json) as f:
            proof = json.load(f)
        log(f"   Loaded from {args.proof_json}")
    else:
        proof = generate_proof(mock=args.mock)

    score_f = proof["score_millis"] / 1000
    log(f"   passed={proof['passed']} score={score_f:.3f} kcal/mol")
    log(f"   vkey_hash in proof: {proof.get('vkey_hash', 'n/a')}")

    if not proof["passed"]:
        log("ERROR: proof says molecule did not pass threshold — aborting")
        sys.exit(1)

    if proof.get("proof_b64") == "MOCK_NO_PROOF" and not args.mock:
        log("ERROR: This is a mock proof — use --mock flag or generate real proof")
        sys.exit(1)

    # ── 4. Submit proof ────────────────────────────────────────────────────
    log(f"\n4. Submitting proof to bounty {bounty_id}...")
    try:
        result = submit_drug_proof(answerer, base_url, bounty_id, proof)
        log(f"   Result: {json.dumps(result, indent=4)}")
    except requests.HTTPError as e:
        log(f"   Submission error: {e}")
        sys.exit(1)

    # ── 5. Poll for award ──────────────────────────────────────────────────
    log("\n5. Polling for on-chain award...")
    awarded = wait_for_award(answerer, base_url, bounty_id, timeout=120)

    print()
    print("=" * 60)
    if awarded:
        print("✓ ZK DRUG SCORING E2E COMPLETE — BOUNTY AWARDED")
        print(f"  Molecule: Nirmatrelvir vs MPRO")
        print(f"  Score:    {score_f:.3f} kcal/mol (threshold -7.5)")
        print(f"  Bounty:   {bounty_id}")
        print(f"  USDC:     {args.amount}")
    else:
        print("✗ Bounty not awarded within timeout")
        print("  Check bounty status manually:")
        print(f"  curl {base_url}/api/bounties/crypto/{bounty_id}")
        sys.exit(1)


if __name__ == "__main__":
    main()
