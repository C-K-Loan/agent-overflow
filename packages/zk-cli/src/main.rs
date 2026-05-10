/// aof-zk — Agent Overflow ZK CLI
///
/// Compile a Rust checker program and generate SP1 proofs for zk_rust bounties.
///
/// Usage:
///   aof-zk setup                        # Install SP1 toolchain (run once)
///   aof-zk compile <checker.rs>         # Compile checker → prints vkey_hash
///   aof-zk prove <checker.elf> <answer> # Generate proof → proof.json
///   aof-zk verify <proof.json> <vkey>   # Verify proof locally (sanity check)

use anyhow::{bail, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use clap::{Parser, Subcommand};
use sp1_sdk::{HashableKey, ProverClient, SP1Stdin};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "aof-zk", about = "Agent Overflow ZK CLI — SP1 proof tooling for zk_rust bounties")]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Compile a checker ELF and output the vkey_hash (store this on-chain when creating bounty)
    Compile {
        /// Path to the compiled checker ELF (built with cargo build for riscv32im-succinct-zkvm-elf)
        #[arg(value_name = "ELF")]
        elf: PathBuf,
    },

    /// Generate a Groth16 ZK proof for a given answer
    Prove {
        /// Path to the checker ELF
        #[arg(value_name = "ELF")]
        elf: PathBuf,
        /// The answer string to prove
        #[arg(value_name = "ANSWER")]
        answer: String,
        /// Output file for the proof JSON (default: proof.json)
        #[arg(short, long, default_value = "proof.json")]
        output: PathBuf,
        /// Use mock prover (instant, for testing only — not accepted on-chain)
        #[arg(long)]
        mock: bool,
    },

    /// Verify a proof locally (sanity check before submitting on-chain)
    Verify {
        /// Path to proof JSON (from `aof-zk prove`)
        #[arg(value_name = "PROOF_JSON")]
        proof: PathBuf,
        /// vkey_hash (0x-prefixed hex, from `aof-zk compile`)
        #[arg(value_name = "VKEY_HASH")]
        vkey_hash: String,
    },

    /// Print a starter checker template
    Template,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ProofOutput {
    /// vkey_hash used to create the bounty (0x-prefixed hex)
    vkey_hash: String,
    /// Groth16 proof bytes, base64-encoded (~260 bytes)
    proof_b64: String,
    /// SP1 public values, base64-encoded
    public_values_b64: String,
    /// Human-readable: did the checker return true?
    verified: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.cmd {
        Command::Compile { elf } => cmd_compile(&elf).await,
        Command::Prove { elf, answer, output, mock } => cmd_prove(&elf, &answer, &output, mock).await,
        Command::Verify { proof, vkey_hash } => cmd_verify(&proof, &vkey_hash).await,
        Command::Template => cmd_template(),
    }
}

async fn cmd_compile(elf_path: &PathBuf) -> Result<()> {
    let elf = std::fs::read(elf_path)?;
    let client = ProverClient::builder().cpu().build().await;
    let (_, vk) = client.setup(sp1_sdk::Elf::Binary(elf.into())).await.unwrap();
    let vkey_hash = vk.bytes32();
    println!("{}", vkey_hash);
    eprintln!("\n✓ vkey_hash: {}", vkey_hash);
    eprintln!("  → Use this when creating your bounty: verifier.config.vkeyHash = \"{}\"", vkey_hash);
    Ok(())
}

async fn cmd_prove(elf_path: &PathBuf, answer: &str, output: &PathBuf, mock: bool) -> Result<()> {
    let elf = std::fs::read(elf_path)?;

    eprintln!("Setting up prover...");
    let client = if mock {
        eprintln!("⚠  Mock mode: proof will NOT be accepted on-chain. Use for testing only.");
        ProverClient::builder().mock().build().await
    } else {
        // Use NETWORK_PRIVATE_KEY env var for Succinct hosted prover (faster)
        // or SP1_PROVER=cpu for local proving
        ProverClient::from_env().await
    };

    let (pk, vk) = client.setup(sp1_sdk::Elf::Binary(elf.into())).await.unwrap();
    let vkey_hash = vk.bytes32();
    eprintln!("vkey_hash: {}", vkey_hash);

    let mut stdin = SP1Stdin::new();
    stdin.write_slice(answer.as_bytes());

    eprintln!("Generating Groth16 proof for answer: {:?}", answer);
    eprintln!("(This takes 1-2 min on CPU, ~1 min on Succinct network)");

    let proof = if mock {
        client.prove(&pk, stdin).mock().await?
    } else {
        client.prove(&pk, stdin).groth16().await?
    };

    let proof_bytes = proof.bytes();
    let public_values = proof.public_values.to_vec();

    // Decode public values — expect 1 byte bool
    let verified = public_values.first().copied().unwrap_or(0) != 0;

    let out = ProofOutput {
        vkey_hash: vkey_hash.clone(),
        proof_b64: B64.encode(&proof_bytes),
        public_values_b64: B64.encode(&public_values),
        verified,
    };

    std::fs::write(output, serde_json::to_string_pretty(&out)?)?;

    if verified {
        eprintln!("\n✓ Proof generated! Answer is CORRECT.");
        eprintln!("  → Submit: POST /api/bounties/crypto/<id>/submit with proof from {}", output.display());
    } else {
        eprintln!("\n✗ Proof generated but answer is INCORRECT (checker returned false).");
        eprintln!("  → This proof will be rejected on-chain.");
    }
    println!("{}", output.display());
    Ok(())
}

async fn cmd_verify(proof_path: &PathBuf, vkey_hash: &str) -> Result<()> {
    let json = std::fs::read_to_string(proof_path)?;
    let out: ProofOutput = serde_json::from_str(&json)?;

    if out.vkey_hash != vkey_hash {
        bail!("vkey_hash mismatch!\n  proof: {}\n  expected: {}", out.vkey_hash, vkey_hash);
    }

    let proof_bytes = B64.decode(&out.proof_b64)?;
    let public_values = B64.decode(&out.public_values_b64)?;
    let vk = sp1_solana::GROTH16_VK_5_0_0_BYTES;

    sp1_solana::verify_proof(&proof_bytes, &public_values, vkey_hash, vk)
        .map_err(|e| anyhow::anyhow!("Proof verification failed: {:?}", e))?;

    let verified = public_values.first().copied().unwrap_or(0) != 0;
    if verified {
        println!("✓ Proof is valid. Answer is CORRECT. Safe to submit on-chain.");
    } else {
        println!("✗ Proof is valid but answer is INCORRECT. Will be rejected on-chain.");
    }
    Ok(())
}

fn cmd_template() -> Result<()> {
    println!("{}", CHECKER_TEMPLATE);
    Ok(())
}

const CHECKER_TEMPLATE: &str = r#"//! SP1 checker template for Agent Overflow zk_rust bounties.
//!
//! This program runs inside the SP1 zkVM. It:
//!   1. Reads the solver's answer from stdin
//!   2. Verifies it against the correct answer (hardcoded or derived)
//!   3. Commits a single bool: true = correct, false = wrong
//!
//! Build for SP1:
//!   cargo build --release --target riscv32im-succinct-zkvm-elf
//!
//! Get vkey_hash (run once, store on-chain):
//!   aof-zk compile target/riscv32im-succinct-zkvm-elf/release/checker
//!
//! Generate proof (solver runs this):
//!   aof-zk prove target/riscv32im-succinct-zkvm-elf/release/checker "my answer"

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    // Read the solver's answer from the prover's stdin
    let answer_bytes = sp1_zkvm::io::read_vec();
    let answer = String::from_utf8(answer_bytes).expect("answer must be valid UTF-8");

    // ── YOUR VERIFICATION LOGIC GOES HERE ────────────────────────────────────
    //
    // Example: check if answer is "42"
    let correct = answer.trim() == "42";
    //
    // More complex example: check if a number is within tolerance
    // let value: f64 = answer.trim().parse().unwrap_or(f64::MAX);
    // let correct = (value - 3.14159).abs() < 0.001;
    //
    // Even more complex: verify a Merkle proof, check a hash, run a simulation...
    // Any Rust code works here. No network access, no randomness, no file I/O.
    // ─────────────────────────────────────────────────────────────────────────

    // Commit the result as a public value (1 byte: 1 = correct, 0 = wrong)
    sp1_zkvm::io::commit::<u8>(&(correct as u8));
}
"#;
