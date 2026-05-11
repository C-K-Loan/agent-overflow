/// mpro-vina-prover — Generate SP1 Groth16 proofs for the drug scoring ZK checker.
///
/// Usage:
///   mpro-vina-prover <ELF> <INPUT_JSON> [--mock] [-o proof.json]
///
/// INPUT_JSON format:
///   {
///     "problem_id": 0,           // 0 = MPRO, 1 = BCR-ABL
///     "ligand": [[x,y,z,r,h,a,d], ...],  // atom arrays (7 f32s each)
///     "n_rot": 6                 // number of rotatable bonds
///   }

use anyhow::{bail, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use sp1_sdk::blocking::{ProverClient, Prover, ProveRequest};
use sp1_sdk::{Elf, SP1Stdin, HashableKey, SP1ProofMode, ProvingKey};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(serde::Deserialize)]
struct Input {
    problem_id: u8,
    ligand: Vec<[f32; 7]>,
    n_rot: u32,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ProofOutput {
    vkey_hash: String,
    proof_b64: String,
    public_values_b64: String,
    /// true = passed (score < threshold)
    passed: bool,
    /// score in kcal/mol × 1000 (integer)
    score_millis: i32,
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        bail!("Usage: {} <ELF> <INPUT_JSON> [--mock] [-o proof.json]", args[0]);
    }
    let elf_path = PathBuf::from(&args[1]);
    let input_path = &args[2];
    let mock = args.contains(&"--mock".to_string());
    let output = args.windows(2).find(|w| w[0] == "-o")
        .map(|w| PathBuf::from(&w[1]))
        .unwrap_or_else(|| PathBuf::from("proof.json"));

    // Parse input
    let input_json = std::fs::read_to_string(input_path)?;
    let input: Input = serde_json::from_str(&input_json)?;

    if mock {
        eprintln!("⚠  Mock mode: proof NOT valid on-chain.");
        std::env::set_var("SP1_PROVER", "mock");
    } else if std::env::var("SP1_PROVER").is_err() {
        std::env::set_var("SP1_PROVER", "cpu");
        eprintln!("SP1_PROVER=cpu (1-3 min). Set SP1_PROVER=network for Succinct hosted prover.");
    }

    let elf_bytes = std::fs::read(&elf_path)?;
    let elf = Elf::Dynamic(Arc::from(elf_bytes.as_slice()));

    let prover = ProverClient::from_env();
    let pk = prover.setup(elf.clone())?;
    let vkey_hash = pk.verifying_key().bytes32();
    eprintln!("vkey_hash: {}", vkey_hash);
    eprintln!("problem_id: {} ({}) | ligand: {} atoms | n_rot: {}",
        input.problem_id,
        if input.problem_id == 0 { "MPRO" } else { "BCR-ABL" },
        input.ligand.len(),
        input.n_rot);

    // Build SP1 stdin
    let mut stdin = SP1Stdin::new();
    stdin.write::<u8>(&input.problem_id);
    stdin.write::<Vec<[f32; 7]>>(&input.ligand);
    stdin.write::<u32>(&input.n_rot);

    if mock {
        eprintln!("Executing (mock, no real proof)...");
        let (pub_vals, _) = prover.execute(elf, stdin).run()?;
        let public_values = pub_vals.to_vec();
        let passed = public_values.first().copied().unwrap_or(0) != 0;
        let score_millis = if public_values.len() >= 5 {
            i32::from_le_bytes([public_values[1], public_values[2], public_values[3], public_values[4]])
        } else { 0 };
        let score_f = score_millis as f32 / 1000.0;
        let out = ProofOutput {
            vkey_hash,
            proof_b64: "MOCK_NO_PROOF".to_string(),
            public_values_b64: B64.encode(&public_values),
            passed,
            score_millis,
        };
        std::fs::write(&output, serde_json::to_string_pretty(&out)?)?;
        if passed { eprintln!("\n✓ PASS — score {:.3} kcal/mol (mock, no real ZK proof)", score_f); }
        else       { eprintln!("\n✗ FAIL — score {:.3} kcal/mol (mock)", score_f); }
        println!("{}", output.display());
        return Ok(());
    }

    eprintln!("Generating Groth16 proof...");
    let proof = prover.prove(&pk, stdin).mode(SP1ProofMode::Groth16).run()?;
    let proof_bytes = proof.bytes();
    let public_values = proof.public_values.to_vec();
    let passed = public_values.first().copied().unwrap_or(0) != 0;
    let score_millis = if public_values.len() >= 5 {
        i32::from_le_bytes([public_values[1], public_values[2], public_values[3], public_values[4]])
    } else { 0 };
    let score_f = score_millis as f32 / 1000.0;

    // Sanity verify locally
    let vk = sp1_solana::GROTH16_VK_5_0_0_BYTES;
    match sp1_solana::verify_proof(&proof_bytes, &public_values, &vkey_hash, vk) {
        Ok(_) => eprintln!("✓ Local verification passed"),
        Err(e) => eprintln!("⚠  Local verification: {:?}", e),
    }

    let out = ProofOutput {
        vkey_hash,
        proof_b64: B64.encode(&proof_bytes),
        public_values_b64: B64.encode(&public_values),
        passed,
        score_millis,
    };
    std::fs::write(&output, serde_json::to_string_pretty(&out)?)?;
    if passed { eprintln!("\n✓ PASS — score {:.3} kcal/mol. Submit: {}", score_f, output.display()); }
    else       { eprintln!("\n✗ FAIL — score {:.3} kcal/mol", score_f); }
    println!("{}", output.display());
    Ok(())
}
