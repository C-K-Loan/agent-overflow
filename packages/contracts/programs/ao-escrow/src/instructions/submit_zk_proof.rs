use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use sha2::{Digest, Sha256};

use crate::errors::EscrowError;
use crate::state::{Bounty, BountyStatus};

pub const ZK_RUST_VERIFIER_TYPE: u8 = 9;

const PLATFORM_FEE_BPS: u64 = 100;
const BPS_DENOMINATOR: u64 = 10_000;

/// SP1 Groth16 VK for SDK v5.0.0 — compressed Gnark format, embedded at compile time.
const GROTH16_VK_V5: &[u8] = include_bytes!("../vk/groth16_vk_v5.bin");

/// BN254 field prime (big-endian) — for G1 Y-negation without ark-bn254.
const BN254_PRIME: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

#[derive(Accounts)]
pub struct SubmitZkProof<'info> {
    #[account(
        mut,
        seeds = [b"bounty", bounty.question_id.as_ref(), bounty.asker.as_ref()],
        bump,
        constraint = bounty.verifier_type == ZK_RUST_VERIFIER_TYPE @ EscrowError::InvalidVerifierType,
        constraint = bounty.status == BountyStatus::Active @ EscrowError::BountyNotActive,
        constraint = bounty.deadline > Clock::get()?.unix_timestamp @ EscrowError::BountyExpired,
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        seeds = [b"vault", bounty.key().as_ref()],
        bump,
        token::mint = bounty.token_mint,
        token::authority = bounty,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut, constraint = answerer_ata.mint == bounty.token_mint @ EscrowError::InvalidMint)]
    pub answerer_ata: Account<'info, TokenAccount>,

    #[account(mut, constraint = platform_fee_account.mint == bounty.token_mint @ EscrowError::InvalidMint)]
    pub platform_fee_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = answerer.key() != bounty.asker @ EscrowError::SelfSolve)]
    pub answerer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<SubmitZkProof>,
    proof: Vec<u8>,
    public_values: Vec<u8>,
) -> Result<()> {
    let bounty = &ctx.accounts.bounty;

    let vkey_hash_str = core::str::from_utf8(
        &bounty.verifier_config[..bounty.verifier_config_len as usize]
    ).map_err(|_| EscrowError::InvalidVerifierConfig)?;

    verify_sp1_proof(&proof, &public_values, vkey_hash_str)
        .map_err(|_| EscrowError::VerificationFailed)?;

    if public_values.is_empty() || public_values[0] == 0 {
        return Err(EscrowError::VerificationFailed.into());
    }

    let fee    = bounty.amount * PLATFORM_FEE_BPS / BPS_DENOMINATOR;
    let payout = bounty.amount - fee;

    let signer_seeds: &[&[&[u8]]] = &[&[
        b"bounty",
        bounty.question_id.as_ref(),
        bounty.asker.as_ref(),
        &[ctx.bumps.bounty],
    ]];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from:      ctx.accounts.vault.to_account_info(),
                to:        ctx.accounts.answerer_ata.to_account_info(),
                authority: ctx.accounts.bounty.to_account_info(),
            },
            signer_seeds,
        ),
        payout,
    )?;

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from:      ctx.accounts.vault.to_account_info(),
                to:        ctx.accounts.platform_fee_account.to_account_info(),
                authority: ctx.accounts.bounty.to_account_info(),
            },
            signer_seeds,
        ),
        fee,
    )?;

    let bounty = &mut ctx.accounts.bounty;
    bounty.status = BountyStatus::Awarded;
    bounty.answerer = ctx.accounts.answerer.key();

    msg!("ZK proof verified on-chain! payout={}", payout);
    Ok(())
}

// ── SP1 Groth16 verification (ported from sp1-solana without ark-bn254) ────────

fn verify_sp1_proof(proof: &[u8], sp1_public_inputs: &[u8], sp1_vkey_hash: &str) -> core::result::Result<(), &'static str> {
    if proof.len() < 260 { return Err("proof too short"); }

    // 1. VK hash prefix check
    let vk_hash_prefix: [u8; 4] = Sha256::digest(GROTH16_VK_V5)[..4].try_into().map_err(|_| "vk hash")?;
    if vk_hash_prefix != proof[..4] { return Err("vk hash mismatch"); }

    // 2. Decode SP1 vkey hash from "0x..." hex string
    let hex_str = sp1_vkey_hash.strip_prefix("0x").ok_or("missing 0x")?;
    let vkey_hash = decode_hex_32(hex_str)?;

    // 3. Build Groth16 public inputs: [vkey_hash[1..32] || SHA256(pub_inputs) & 0x1F_mask]
    let mut committed: [u8; 32] = Sha256::digest(sp1_public_inputs).into();
    committed[0] &= 0x1F; // BN254 field size mask

    // public_inputs for Groth16 verifier: 2 × 32-byte scalars
    let mut pub0 = [0u8; 32];
    pub0[1..].copy_from_slice(&vkey_hash[1..]); // vkey_hash[1..32], padded with 0 at [0]
    let pub1 = committed;

    // 4. Parse proof (skip 4-byte prefix, then 64+128+64)
    let raw = &proof[4..];
    let pi_a_neg = negate_g1_y(raw[..64].try_into().map_err(|_| "pi_a")?);
    let pi_b: [u8; 128] = raw[64..192].try_into().map_err(|_| "pi_b")?;
    let pi_c: [u8; 64]  = raw[192..256].try_into().map_err(|_| "pi_c")?;

    // 5. Load and decompress VK using Solana native BN254 syscalls via groth16_solana
    let vk = load_sp1_vk(GROTH16_VK_V5)?;

    // 6. Verify
    let public_inputs = [pub0, pub1];
    let mut verifier = Groth16Verifier::new(&pi_a_neg, &pi_b, &pi_c, &public_inputs, &vk)
        .map_err(|_| "verifier init")?;
    verifier.verify().map_err(|_| "verification failed")?;
    Ok(())
}

/// Load SP1 Groth16 VK from the compressed Gnark binary format.
/// Uses Solana native alt_bn128 syscalls (via groth16_solana) for decompression.
fn load_sp1_vk(vk_bytes: &[u8]) -> core::result::Result<Groth16Verifyingkey<'static>, &'static str> {
    // VK binary layout (Gnark compressed):
    //   [0..32]    alpha_g1 (compressed G1)
    //   [32..64]   beta_g1  (unused)
    //   [64..128]  beta_g2  (compressed G2)
    //   [128..192] gamma_g2 (compressed G2)
    //   [192..224] delta_g1 (unused)
    //   [224..288] delta_g2 (compressed G2)
    //   [288..292] num_k u32 be
    //   [292..]    k[] compressed G1 points

    let alpha_g1 = decompress_gnark_g1(&vk_bytes[..32].try_into().map_err(|_| "alpha")?)?;
    let beta_g2  = decompress_gnark_g2(&vk_bytes[64..128].try_into().map_err(|_| "beta")?)?;
    let gamma_g2 = decompress_gnark_g2(&vk_bytes[128..192].try_into().map_err(|_| "gamma")?)?;
    let delta_g2 = decompress_gnark_g2(&vk_bytes[224..288].try_into().map_err(|_| "delta")?)?;

    let num_k = u32::from_be_bytes(vk_bytes[288..292].try_into().map_err(|_| "num_k")?) as usize;

    // Decompress IC (k) points — groth16_solana stores them in a static slice
    // We leak a Vec here since Groth16Verifyingkey<'static> needs a 'static ref
    // This is safe because the program is ephemeral per-instruction
    let mut k_points: Vec<[u8; 64]> = Vec::new();
    for i in 0..num_k {
        let offset = 292 + i * 32;
        let g1 = decompress_gnark_g1(&vk_bytes[offset..offset+32].try_into().map_err(|_| "ic")?)?;
        k_points.push(g1);
    }
    let k_static: &'static [[u8; 64]] = Box::leak(k_points.into_boxed_slice());

    Ok(Groth16Verifyingkey {
        nr_pubinputs: num_k,
        vk_alpha_g1: alpha_g1,
        vk_beta_g2:  beta_g2,
        vk_gamme_g2: gamma_g2,
        vk_delta_g2: delta_g2,
        vk_ic:       k_static,
    })
}

/// Convert Gnark compressed G1 (32 bytes) → Solana alt_bn128 format → decompress.
fn decompress_gnark_g1(gnark: &[u8; 32]) -> core::result::Result<[u8; 64], &'static str> {
    let ark = gnark_to_ark_compressed_g1(gnark);
    groth16_solana::decompression::decompress_g1(&ark).map_err(|_| "g1 decompress")
}

/// Convert Gnark compressed G2 (64 bytes) → Solana alt_bn128 format → decompress.
fn decompress_gnark_g2(gnark: &[u8; 64]) -> core::result::Result<[u8; 128], &'static str> {
    let ark = gnark_to_ark_compressed_g2(gnark);
    groth16_solana::decompression::decompress_g2(&ark).map_err(|_| "g2 decompress")
}

/// Convert Gnark compressed G1 flag bytes to Ark-compatible format (then reverse).
fn gnark_to_ark_compressed_g1(gnark: &[u8; 32]) -> [u8; 32] {
    let mut out = *gnark;
    out[0] = gnark_flag_to_ark(out[0]);
    out.reverse();
    out
}

fn gnark_to_ark_compressed_g2(gnark: &[u8; 64]) -> [u8; 64] {
    let mut out = *gnark;
    out[0] = gnark_flag_to_ark(out[0]);
    out.reverse();
    out
}

/// Gnark uses [0b10, 0b11, 0b01] flags; Ark uses [0b00, 0b10, 0b01].
fn gnark_flag_to_ark(msb: u8) -> u8 {
    let gnark_flag = msb & 0b1100_0000;
    let ark_flag = match gnark_flag {
        0b1000_0000 => 0b0000_0000, // positive
        0b1100_0000 => 0b1000_0000, // negative
        0b0100_0000 => 0b0100_0000, // infinity
        _            => 0b0000_0000,
    };
    (msb & 0b0011_1111) | ark_flag
}

/// Negate a G1 point's Y coordinate over BN254 prime field (y_neg = p - y).
/// The point is in big-endian uncompressed format: x(32) || y(32).
fn negate_g1_y(g1: &[u8; 64]) -> [u8; 64] {
    let mut out = *g1;
    let y = &g1[32..64];
    let mut y_neg = [0u8; 32];
    let mut borrow: i16 = 0;
    for i in (0..32).rev() {
        let diff = (BN254_PRIME[i] as i16) - (y[i] as i16) - borrow;
        if diff < 0 { y_neg[i] = (diff + 256) as u8; borrow = 1; }
        else         { y_neg[i] = diff as u8;          borrow = 0; }
    }
    out[32..64].copy_from_slice(&y_neg);
    out
}

/// Decode a 64-char hex string into 32 bytes. No external crate needed.
fn decode_hex_32(hex: &str) -> core::result::Result<[u8; 32], &'static str> {
    if hex.len() != 64 { return Err("hex len"); }
    let mut out = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks(2).enumerate() {
        let hi = hex_nibble(chunk[0])?;
        let lo = hex_nibble(chunk[1])?;
        out[i] = (hi << 4) | lo;
    }
    Ok(out)
}

fn hex_nibble(b: u8) -> core::result::Result<u8, &'static str> {
    match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err("bad hex char"),
    }
}
