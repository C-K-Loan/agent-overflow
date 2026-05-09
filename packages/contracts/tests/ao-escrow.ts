import * as anchor from "@coral-xyz/anchor";
import { Program, BN, web3 } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "crypto";

describe("ao_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AoEscrow as Program;
  const payer = provider.wallet as anchor.Wallet;

  let usdcMint: web3.PublicKey;
  let askerAta: web3.PublicKey;
  let answererKp: web3.Keypair;
  let answererAta: web3.PublicKey;

  // platformKeypair: use payer as platform wallet for test simplicity
  // In production, this is a separate keypair held by the backend.
  const platformKeypair = payer.payer; // Keypair (has .publicKey and signs)
  let platformFeeAta: { address: web3.PublicKey };

  const SMALL = new BN(10_000_000);   // $10 USDC — no commit-reveal
  const BIG = new BN(100_000_000);    // $100 USDC — commit-reveal required

  function sha256(data: string): Buffer {
    return createHash("sha256").update(data).digest();
  }

  function qid(s: string): Buffer {
    return sha256(s);
  }

  function bountyPda(q: Buffer, asker: web3.PublicKey) {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("bounty"), Buffer.from(q), asker.toBuffer()],
      program.programId
    );
  }

  function vaultPda(bounty: web3.PublicKey) {
    return web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), bounty.toBuffer()],
      program.programId
    );
  }

  function dl7d(): BN {
    return new BN(Math.floor(Date.now() / 1000) + 7 * 86400);
  }

  /** Helper: create + fund a bounty in one go */
  async function createAndFund(
    questionStr: string,
    amount: BN,
    verifierType: number,
    config: Buffer
  ) {
    const q = qid(questionStr);
    const [bPda] = bountyPda(q, payer.publicKey);
    const [vPda] = vaultPda(bPda);

    await program.methods
      .createBounty(q, amount, verifierType, config, dl7d())
      .accounts({
        asker: payer.publicKey,
        bounty: bPda,
        tokenMint: usdcMint,
        askerTokenAccount: askerAta,
        vaultAuthority: vPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .fundBounty()
      .accounts({
        asker: payer.publicKey,
        bounty: bPda,
        tokenMint: usdcMint,
        askerTokenAccount: askerAta,
        vault: vPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    return { q, bPda, vPda };
  }

  /** Helper: submit answer to a bounty using platform wallet's ATA as fee account */
  async function submit(bPda: web3.PublicKey, vPda: web3.PublicKey, answer: string) {
    return program.methods
      .submitAnswer(answer)
      .accounts({
        answerer: answererKp.publicKey,
        bounty: bPda,
        vault: vPda,
        answererTokenAccount: answererAta,
        platformFeeAccount: platformFeeAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([answererKp])
      .rpc();
  }

  // ===== SETUP =====

  before(async () => {
    // Create mock USDC mint (6 decimals)
    usdcMint = await createMint(provider.connection, payer.payer, payer.publicKey, null, 6);

    // Fund asker with 10,000 USDC
    askerAta = await createAccount(provider.connection, payer.payer, usdcMint, payer.publicKey);
    await mintTo(provider.connection, payer.payer, usdcMint, askerAta, payer.payer, 10_000_000_000);

    // Create answerer (a separate keypair so payer doesn't self-submit)
    answererKp = web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(answererKp.publicKey, 2 * web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    answererAta = await createAccount(provider.connection, payer.payer, usdcMint, answererKp.publicKey);

    // Create platform fee ATA — the platform wallet's ATA for USDC.
    // Using payer as platform wallet (same keypair) for test simplicity.
    // In production the backend passes its own platform wallet's ATA here.
    platformFeeAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      platformKeypair,
      usdcMint,
      platformKeypair.publicKey
    );
    console.log("  Platform fee ATA:", platformFeeAta.address.toBase58());

    // Initialize fee vault PDA token account (kept for backward compat; optional for submit_answer).
    // The new submit_answer uses platformFeeAccount (ATA) instead of the fee_vault PDA.
    // init_fee_vault is still callable (e.g. for reveal_answer / claim_fees flows).
    const [fv] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault")],
      program.programId
    );
    try {
      await program.methods
        .initFeeVault()
        .accounts({
          payer: payer.publicKey,
          tokenMint: usdcMint,
          feeVault: fv,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log("  Fee vault PDA initialized at", fv.toBase58(), "(optional, used by reveal_answer)");
    } catch (e: any) {
      // Already initialized or not needed — safe to ignore in tests
      console.log("  Fee vault PDA skipped:", e.message?.slice(0, 60));
    }
  });

  // ===== CREATE BOUNTY =====

  describe("create_bounty", () => {
    it("creates an exact_number bounty", async () => {
      const q = qid("q-create-1");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);

      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);

      await program.methods
        .createBounty(q, SMALL, 1, config, dl7d())
        .accounts({
          asker: payer.publicKey,
          bounty: bPda,
          tokenMint: usdcMint,
          askerTokenAccount: askerAta,
          vaultAuthority: vPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      const bounty = await program.account.bounty.fetch(bPda);
      assert.equal(bounty.amount.toNumber(), SMALL.toNumber());
      assert.equal(bounty.verifierType, 1);
      assert.equal(bounty.commitReveal, false);
      console.log("    Bounty created: $10, exact_number, no commit-reveal");
    });

    it("rejects amount below $1 minimum", async () => {
      const q = qid("q-below-min");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(1n);

      try {
        await program.methods
          .createBounty(q, new BN(100_000), 1, config, dl7d())
          .accounts({
            asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
            askerTokenAccount: askerAta, vaultAuthority: vPda,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "AmountBelowMinimum");
      }
    });

    it("sets commit_reveal=true for >$50", async () => {
      const q = qid("q-commit-flag");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);

      await program.methods
        .createBounty(q, BIG, 1, config, dl7d())
        .accounts({
          asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
          askerTokenAccount: askerAta, vaultAuthority: vPda,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      const bounty = await program.account.bounty.fetch(bPda);
      assert.equal(bounty.commitReveal, true);
    });

    it("rejects deadline < 1 hour", async () => {
      const q = qid("q-short-deadline");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(1n);

      try {
        await program.methods
          .createBounty(q, SMALL, 1, config, new BN(Math.floor(Date.now() / 1000) + 60))
          .accounts({
            asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
            askerTokenAccount: askerAta, vaultAuthority: vPda,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "InvalidDeadline");
      }
    });

    it("rejects unknown verifier type", async () => {
      const q = qid("q-unknown-verifier");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);

      try {
        await program.methods
          .createBounty(q, SMALL, 99, Buffer.alloc(8), dl7d())
          .accounts({
            asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
            askerTokenAccount: askerAta, vaultAuthority: vPda,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "UnknownVerifier");
      }
    });

    it("rejects duplicate (same question + asker)", async () => {
      const q = qid("q-create-1"); // already exists
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);

      try {
        await program.methods
          .createBounty(q, SMALL, 1, config, dl7d())
          .accounts({
            asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
            askerTokenAccount: askerAta, vaultAuthority: vPda,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.ok(e); // PDA already initialized
      }
    });
  });

  // ===== FUND BOUNTY =====

  describe("fund_bounty", () => {
    it("funds vault with USDC", async () => {
      const q = qid("q-create-1");
      const [bPda] = bountyPda(q, payer.publicKey);
      const [vPda] = vaultPda(bPda);

      const before = (await getAccount(provider.connection, askerAta)).amount;

      await program.methods
        .fundBounty()
        .accounts({
          asker: payer.publicKey, bounty: bPda, tokenMint: usdcMint,
          askerTokenAccount: askerAta, vault: vPda,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const vaultBal = (await getAccount(provider.connection, vPda)).amount;
      assert.equal(Number(vaultBal), SMALL.toNumber());

      const after = (await getAccount(provider.connection, askerAta)).amount;
      assert.equal(Number(before) - Number(after), SMALL.toNumber());
      console.log("    Vault funded with", SMALL.toNumber() / 1_000_000, "USDC");
    });
  });

  // ===== SUBMIT ANSWER — exact_number =====

  describe("submit_answer (exact_number)", () => {
    let bPda: web3.PublicKey;
    let vPda: web3.PublicKey;

    before(async () => {
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);
      const r = await createAndFund("q-submit-exact", SMALL, 1, config);
      bPda = r.bPda;
      vPda = r.vPda;
    });

    it("rejects wrong answer", async () => {
      try {
        await submit(bPda, vPda, "43");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "VerificationFailed");
      }
    });

    it("accepts correct answer and pays 99% to answerer + 1% fee", async () => {
      const answBefore = (await getAccount(provider.connection, answererAta)).amount;

      await submit(bPda, vPda, "42");

      const bounty = await program.account.bounty.fetch(bPda);
      assert.ok(bounty.answerer.equals(answererKp.publicKey));

      const answAfter = (await getAccount(provider.connection, answererAta)).amount;
      const payout = Number(answAfter) - Number(answBefore);
      assert.equal(payout, SMALL.toNumber() * 99 / 100);
      console.log("    Payout:", payout / 1_000_000, "USDC, Fee:", SMALL.toNumber() / 100 / 1_000_000, "USDC");
    });

    it("rejects submission to already-awarded bounty", async () => {
      try {
        await submit(bPda, vPda, "42");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "BountyNotActive");
      }
    });
  });

  // ===== SUBMIT ANSWER — exact_string =====

  describe("submit_answer (exact_string)", () => {
    let bPda: web3.PublicKey;
    let vPda: web3.PublicKey;

    before(async () => {
      const config = Buffer.from(sha256("secret answer"));
      const r = await createAndFund("q-submit-hash", SMALL, 0, config);
      bPda = r.bPda;
      vPda = r.vPda;
    });

    it("rejects wrong pre-image", async () => {
      try {
        await submit(bPda, vPda, "wrong answer");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "VerificationFailed");
      }
    });

    it("accepts correct pre-image", async () => {
      await submit(bPda, vPda, "secret answer");
      const bounty = await program.account.bounty.fetch(bPda);
      assert.ok(bounty.answerer.equals(answererKp.publicKey));
    });
  });

  // ===== SUBMIT ANSWER — numeric_tolerance =====

  describe("submit_answer (numeric_tolerance)", () => {
    let bPda: web3.PublicKey;
    let vPda: web3.PublicKey;

    before(async () => {
      // target=3141590, epsilon=1000
      const config = Buffer.alloc(16);
      config.writeBigInt64LE(3141590n, 0);
      config.writeBigUInt64LE(1000n, 8);
      const r = await createAndFund("q-submit-tol", SMALL, 2, config);
      bPda = r.bPda;
      vPda = r.vPda;
    });

    it("rejects answer outside tolerance", async () => {
      try {
        await submit(bPda, vPda, "3143000"); // diff=1410 > 1000
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "VerificationFailed");
      }
    });

    it("accepts answer within tolerance", async () => {
      await submit(bPda, vPda, "3141800"); // diff=210 <= 1000
      const bounty = await program.account.bounty.fetch(bPda);
      assert.ok(bounty.answerer.equals(answererKp.publicKey));
    });
  });

  // ===== SUBMIT ANSWER — numeric_range =====

  describe("submit_answer (numeric_range)", () => {
    let bPda: web3.PublicKey;
    let vPda: web3.PublicKey;

    before(async () => {
      const config = Buffer.alloc(16);
      config.writeBigInt64LE(10n, 0);
      config.writeBigInt64LE(100n, 8);
      const r = await createAndFund("q-submit-range", SMALL, 3, config);
      bPda = r.bPda;
      vPda = r.vPda;
    });

    it("rejects below range", async () => {
      try {
        await submit(bPda, vPda, "5");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "VerificationFailed");
      }
    });

    it("rejects above range", async () => {
      try {
        await submit(bPda, vPda, "101");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "VerificationFailed");
      }
    });

    it("accepts within range", async () => {
      await submit(bPda, vPda, "50");
      const bounty = await program.account.bounty.fetch(bPda);
      assert.ok(bounty.answerer.equals(answererKp.publicKey));
    });
  });

  // ===== REFUND =====

  describe("refund", () => {
    it("rejects refund before deadline", async () => {
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);
      const { bPda, vPda } = await createAndFund("q-refund-early", SMALL, 1, config);

      try {
        await program.methods
          .refund()
          .accounts({
            asker: payer.publicKey, bounty: bPda, vault: vPda,
            askerTokenAccount: askerAta, tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "DeadlineNotPassed");
      }
    });
  });

  // ===== COMMIT-REVEAL =====

  describe("commit-reveal", () => {
    it("rejects direct submit on >$50 bounty", async () => {
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(42n);
      const { bPda, vPda } = await createAndFund("q-commit-required", BIG, 1, config);

      try {
        await submit(bPda, vPda, "42");
        assert.fail("Should have thrown");
      } catch (e: any) {
        assert.include(e.toString(), "CommitRevealRequired"); // CommitRevealRequired
      }
    });
  });

  // ===== FEE MATH =====

  describe("fee calculation", () => {
    it("1% fee on $10 bounty = $0.10 fee + $9.90 payout", async () => {
      const config = Buffer.alloc(8);
      config.writeBigInt64LE(7n);
      const { bPda, vPda } = await createAndFund("q-fee-math", SMALL, 1, config);

      // Read the platform fee ATA balance before submission
      let feeBefore: bigint;
      try {
        feeBefore = (await getAccount(provider.connection, platformFeeAta.address)).amount;
      } catch {
        feeBefore = 0n;
      }

      const answBefore = (await getAccount(provider.connection, answererAta)).amount;

      await submit(bPda, vPda, "7");

      const answAfter = (await getAccount(provider.connection, answererAta)).amount;
      const feeAfter = (await getAccount(provider.connection, platformFeeAta.address)).amount;

      const payout = Number(answAfter) - Number(answBefore);
      const fee = Number(feeAfter) - Number(feeBefore);

      assert.equal(payout, 9_900_000);  // $9.90
      assert.equal(fee, 100_000);       // $0.10
      assert.equal(payout + fee, SMALL.toNumber());
      console.log("    Fee math verified: payout=$" + payout/1e6 + " fee=$" + fee/1e6);
    });
  });
});
