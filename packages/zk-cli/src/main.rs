/// aof-zk — Agent Overflow ZK CLI (SP1 v6)
///
/// Usage:
///   aof-zk compile <checker.elf>          # Get vkey_hash (store on-chain)
///   aof-zk prove <checker.elf> <answer>   # Generate proof.json
///   aof-zk verify <proof.json> <vkey>     # Verify proof locally
///   aof-zk template                       # Print starter checker template

use anyhow::{bail, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use clap::{Parser, Subcommand};
use sp1_sdk::blocking::{ProverClient, Prover, ProveRequest};
use sp1_sdk::{Elf, SP1Stdin, HashableKey, SP1ProofMode, ProvingKey};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "aof-zk", about = "Agent Overflow ZK CLI — SP1 proof tooling for zk_rust bounties")]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print vkey_hash for a compiled checker ELF
    Compile { #[arg(value_name = "ELF")] elf: PathBuf },

    /// Generate a Groth16 ZK proof for a given answer
    Prove {
        #[arg(value_name = "ELF")] elf: PathBuf,
        #[arg(value_name = "ANSWER")] answer: String,
        #[arg(short, long, default_value = "proof.json")] output: PathBuf,
        /// Mock mode: instant, NOT valid on-chain (for testing only)
        #[arg(long)] mock: bool,
    },

    /// Verify a proof locally (sanity check before on-chain submit)
    Verify {
        #[arg(value_name = "PROOF_JSON")] proof: PathBuf,
        #[arg(value_name = "VKEY_HASH")] vkey_hash: String,
    },

    /// Print a starter checker.rs template
    Template,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ProofOutput {
    vkey_hash: String,
    proof_b64: String,
    public_values_b64: String,
    verified: bool,
}

fn load_elf(path: &PathBuf) -> Result<Elf> {
    let bytes = std::fs::read(path)?;
    Ok(Elf::Dynamic(Arc::from(bytes.as_slice())))
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Command::Compile { elf } => {
            let prover = ProverClient::from_env();
            let pk = prover.setup(load_elf(&elf)?)?;
            let hash = pk.verifying_key().bytes32();
            println!("{}", hash);
            eprintln!("\n✓ vkey_hash: {}", hash);
            eprintln!("  Store this on-chain: verifier.config.vkeyHash = \"{}\"", hash);
            Ok(())
        }

        Command::Prove { elf, answer, output, mock } => {
            if mock {
                eprintln!("⚠  Mock mode: proof NOT valid on-chain.");
                std::env::set_var("SP1_PROVER", "mock");
            } else if std::env::var("SP1_PROVER").is_err() {
                std::env::set_var("SP1_PROVER", "cpu");
                eprintln!("SP1_PROVER=cpu (1-2 min). Set SP1_PROVER=network for Succinct hosted prover.");
            }

            let prover = ProverClient::from_env();
            let pk = prover.setup(load_elf(&elf)?)?;
            let vkey_hash = pk.verifying_key().bytes32();
            eprintln!("vkey_hash: {}", vkey_hash);

            let mut stdin = SP1Stdin::new();
            stdin.write_slice(answer.as_bytes());

            eprintln!("Generating {}proof for: {:?}", if mock { "mock " } else { "Groth16 " }, answer);

            if mock {
                // Mock: execute the checker to verify logic, no real ZK proof
                eprintln!("Executing checker (no proof generated in mock mode)...");
                let (pub_vals, _) = prover.execute(load_elf(&elf)?, stdin).run()?;
                let public_values = pub_vals.to_vec();
                let verified = public_values.first().copied().unwrap_or(0) != 0;
                let out = ProofOutput {
                    vkey_hash,
                    proof_b64: "MOCK_NO_PROOF".to_string(),
                    public_values_b64: B64.encode(&public_values),
                    verified,
                };
                std::fs::write(&output, serde_json::to_string_pretty(&out)?)?;
                if verified { eprintln!("\n✓ Checker says: CORRECT (mock — no real ZK proof)"); }
                else         { eprintln!("\n✗ Checker says: WRONG (mock)"); }
                println!("{}", output.display());
                return Ok(());
            }

            let proof = prover.prove(&pk, stdin).mode(SP1ProofMode::Groth16).run()?;
            let proof_bytes = proof.bytes();
            let public_values = proof.public_values.to_vec();
            let verified = public_values.first().copied().unwrap_or(0) != 0;

            let out = ProofOutput {
                vkey_hash,
                proof_b64: B64.encode(&proof_bytes),
                public_values_b64: B64.encode(&public_values),
                verified,
            };
            std::fs::write(&output, serde_json::to_string_pretty(&out)?)?;

            if verified { eprintln!("\n✓ Answer is CORRECT. Submit: {}", output.display()); }
            else         { eprintln!("\n✗ Answer is INCORRECT — will be rejected on-chain."); }
            println!("{}", output.display());
            Ok(())
        }

        Command::Verify { proof, vkey_hash } => {
            let json = std::fs::read_to_string(&proof)?;
            let out: ProofOutput = serde_json::from_str(&json)?;
            if out.vkey_hash != vkey_hash {
                bail!("vkey_hash mismatch!\n  proof: {}\n  expected: {}", out.vkey_hash, vkey_hash);
            }
            let proof_bytes = B64.decode(&out.proof_b64)?;
            let public_values = B64.decode(&out.public_values_b64)?;
            let vk = sp1_solana::GROTH16_VK_5_0_0_BYTES;
            sp1_solana::verify_proof(&proof_bytes, &public_values, &vkey_hash, vk)
                .map_err(|e| anyhow::anyhow!("Proof verification failed: {:?}", e))?;
            let verified = public_values.first().copied().unwrap_or(0) != 0;
            if verified { println!("✓ Proof valid. Answer CORRECT. Safe to submit on-chain."); }
            else        { println!("✗ Proof valid but answer INCORRECT. Will be rejected."); }
            Ok(())
        }

        Command::Template => { println!("{}", TEMPLATE); Ok(()) }
    }
}

const TEMPLATE: &str = r#"//! SP1 checker for Agent Overflow zk_rust bounties.
//!
//! Build: cargo prove build
//! Get vkey: aof-zk compile target/elf-compilation/riscv64im-succinct-zkvm-elf/release/<name>
//! Prove:    aof-zk prove <elf> "my answer" --mock   (remove --mock for real proof)

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    let answer = String::from_utf8(sp1_zkvm::io::read_vec()).unwrap();

    // ── YOUR VERIFICATION LOGIC ────────────────────────────────────────────
    let correct = answer.trim() == "42"; // change this!
    // ──────────────────────────────────────────────────────────────────────

    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
"#;
