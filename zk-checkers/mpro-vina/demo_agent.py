"""
Phase 6: Demo drug-discovery agent for Agent Overflow ZK Drug Scoring bounties.

This agent:
1. Docks a molecule against MPRO or BCR-ABL using AutoDock Vina
2. If the docked score looks promising, prepares the ZK proof input
3. Generates a Groth16 SP1 proof (proving score < threshold)
4. Submits the proof to Agent Overflow for on-chain verification + USDC payout

Usage:
  python3 demo_agent.py --bounty <BOUNTY_ID> --molecule nirmatrelvir
  python3 demo_agent.py --bounty <BOUNTY_ID> --sdf /path/to/molecule.sdf --problem 0
  python3 demo_agent.py --list-bounties
"""

import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path
import requests

HERE = Path(__file__).parent
PROVER_ELF = HERE / "sp1_program/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/mpro-vina-sp1"
PROVER_BIN = (HERE / "prover/target/release/mpro-vina-prover"
              if (HERE / "prover/target/release/mpro-vina-prover").exists()
              else HERE / "prover/target/debug/mpro-vina-prover")
PREPARE_PY = HERE / "prover/prepare_input.py"

# Receptor configs matching the hardcoded MPRO_SITE and BCRABL_SITE in sites.rs
RECEPTORS = {
    0: {
        "name":     "MPRO (SARS-CoV-2 main protease, 6LU7)",
        "receptor": HERE / "binding_sites/6LU7_prep.pdbqt",
        "center":   [-11.6, 14.6, 65.2],
        "box_size": [25.0, 25.0, 25.0],
        "threshold": -7.5,   # calibrated threshold for our scorer
    },
    1: {
        "name":     "BCR-ABL kinase (2HYY)",
        "receptor": HERE / "binding_sites/2HYY_prep.pdbqt",
        "center":   [37.2, 37.0, 30.4],
        "box_size": [30.0, 30.0, 30.0],
        "threshold": -10.5,
    },
}

BASE_URL = os.environ.get("AOF_BASE_URL", "https://agent-overflow.vercel.app")
API_KEY  = os.environ.get("AOF_API_KEY", "")


def log(msg): print(f"[demo_agent] {msg}", flush=True)


def dock_molecule(sdf_path: Path, problem_id: int, n_poses: int = 9) -> tuple[float, Path]:
    """Dock molecule with Vina, return (best_score, docked_pdbqt_path)."""
    from vina import Vina
    rec = RECEPTORS[problem_id]

    # Prepare ligand PDBQT
    lig_pdbqt = str(sdf_path).replace(".sdf", "_prep.pdbqt")
    if not Path(lig_pdbqt).exists():
        log(f"Preparing ligand PDBQT...")
        subprocess.run(
            ["mk_prepare_ligand.py", "-i", str(sdf_path), "-o", lig_pdbqt],
            check=True, capture_output=True
        )

    log(f"Docking against {rec['name']}...")
    v = Vina(sf_name="vina", verbosity=0)
    v.set_receptor(str(rec["receptor"]))
    v.set_ligand_from_file(lig_pdbqt)
    v.compute_vina_maps(center=rec["center"], box_size=rec["box_size"])
    v.dock(exhaustiveness=16, n_poses=n_poses)

    poses = v.energies()
    best_score = float(poses[0][0])

    docked_pdbqt = str(sdf_path).replace(".sdf", "_docked.pdbqt")
    v.write_poses(docked_pdbqt, n_poses=1, overwrite=True)

    log(f"Best Vina score: {best_score:.3f} kcal/mol")
    return best_score, Path(docked_pdbqt)


def generate_proof(docked_pdbqt: Path, problem_id: int, mock: bool = False) -> dict:
    """Generate SP1 Groth16 proof. Returns proof dict with vkey_hash, proof_b64, etc."""
    # Step 1: Prepare input JSON
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        input_path = f.name
    subprocess.run(
        [sys.executable, str(PREPARE_PY), str(docked_pdbqt), "--problem", str(problem_id), "-o", input_path],
        check=True
    )

    # Step 2: Run prover
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        proof_path = f.name
    cmd = [str(PROVER_BIN), str(PROVER_ELF), input_path, "-o", proof_path]
    if mock:
        cmd.append("--mock")
    log(f"Running {'mock ' if mock else 'Groth16 '}prover (this may take a few minutes)...")
    subprocess.run(cmd, check=True)

    with open(proof_path) as f:
        proof = json.load(f)
    os.unlink(input_path)
    os.unlink(proof_path)
    return proof


def submit_proof(bounty_id: str, proof: dict) -> dict:
    """Submit ZK proof to Agent Overflow API."""
    import base64
    proof_bytes  = base64.b64decode(proof["proof_b64"])
    pubval_bytes = base64.b64decode(proof["public_values_b64"])

    payload = {
        "proof":        list(proof_bytes),
        "publicValues": list(pubval_bytes),
    }
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    url = f"{BASE_URL}/api/bounties/crypto/{bounty_id}/submit"
    log(f"Submitting to {url}...")
    r = requests.post(url, json=payload, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()


def list_bounties():
    """List available ZK drug scoring bounties."""
    r = requests.get(f"{BASE_URL}/api/bounties/crypto?verifierType=zk_rust", timeout=30)
    r.raise_for_status()
    bounties = r.json().get("bounties", [])
    zk_bounties = [b for b in bounties if b.get("verifier", {}).get("type") == "zk_rust"]
    print(f"Found {len(zk_bounties)} ZK Rust bounties:")
    for b in zk_bounties:
        print(f"  {b['id']}: {b['questionId']} — ${b['amount']} USDC")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bounty",  help="Bounty ID to solve")
    ap.add_argument("--molecule", choices=["nirmatrelvir", "imatinib", "aspirin"],
                    help="Use a pre-docked test molecule")
    ap.add_argument("--sdf",     help="Path to custom molecule SDF")
    ap.add_argument("--problem", type=int, choices=[0, 1], default=0,
                    help="Problem ID: 0=MPRO (default), 1=BCR-ABL")
    ap.add_argument("--mock",    action="store_true",
                    help="Mock mode: no real proof (for testing)")
    ap.add_argument("--no-submit", action="store_true",
                    help="Skip final submission (just generate proof)")
    ap.add_argument("--list-bounties", action="store_true")
    args = ap.parse_args()

    if args.list_bounties:
        list_bounties()
        return

    if not args.bounty and not args.no_submit:
        ap.error("--bounty required (or use --no-submit to test locally)")

    # Determine ligand source
    if args.molecule:
        docked_pdbqt = HERE / f"test_molecules/{args.molecule}_docked.pdbqt"
        if not docked_pdbqt.exists():
            log(f"Pre-docked PDBQT not found. Docking {args.molecule}...")
            sdf = HERE / f"test_molecules/{args.molecule}.sdf"
            score, docked_pdbqt = dock_molecule(sdf, args.problem)
        else:
            log(f"Using pre-docked pose: {docked_pdbqt}")
    elif args.sdf:
        sdf = Path(args.sdf)
        score, docked_pdbqt = dock_molecule(sdf, args.problem)
    else:
        ap.error("--molecule or --sdf required")

    # Generate ZK proof
    proof = generate_proof(docked_pdbqt, args.problem, mock=args.mock)
    score_f = proof["score_millis"] / 1000
    log(f"Score: {score_f:.3f} kcal/mol | Passed: {proof['passed']}")

    if not proof["passed"]:
        log("Molecule does not pass the threshold — proof would fail on-chain. Aborting.")
        sys.exit(1)

    if args.no_submit:
        log(f"--no-submit set. Proof ready:")
        print(json.dumps(proof, indent=2))
        return

    # Submit proof
    result = submit_proof(args.bounty, proof)
    log(f"Submission result: {json.dumps(result, indent=2)}")
    if result.get("status") == "awarded":
        log("✓ Bounty AWARDED! USDC payout initiated.")
    else:
        log(f"Status: {result.get('status', 'unknown')}")


if __name__ == "__main__":
    main()
