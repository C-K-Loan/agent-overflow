# Solana Dev Tasks — Final Sprint

⚠️ **DO TASK 0 FIRST. Confirm with CKL before any force push. Do not proceed to Task 1 or 2 until CKL gives the green light.**

---

## Task 0 — Repo Cleanup (do before ANYTHING else)

The repo is going public. There's a Solana keypair that was accidentally committed
and needs to be wiped from git history before the repo is visible.

### Step 0a — Commit staged changes first

These are already staged and safe to commit:

```bash
cd /home/ckl/Agent/agent-overflow

git add .gitignore
git add app/.env.example
git add app/src/lib/solana/constants.ts  # escrow program ID updated
# Add any other staged changes from your work

git commit -m "chore: remove keypair from tracking, update .gitignore, update escrow program ID"
```

### Step 0b — Verify the keypair is no longer tracked

```bash
git ls-files | grep keypair
# Should return NOTHING. If it returns anything, stop and ask CKL.
```

### Step 0c — BFG history purge (removes keypair from ALL past commits)

⚠️ **This rewrites git history. Confirm with CKL before running.**
⚠️ All other devs must re-clone or hard-reset after this.

```bash
# Install BFG if not installed
# macOS: brew install bfg
# Linux: download from https://rtyley.github.io/bfg-repo-cleaner/
#   wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
#   alias bfg='java -jar bfg-1.14.0.jar'

cd /home/ckl/Agent/agent-overflow

# Make a fresh clone as backup first
git clone --mirror https://github.com/C-K-Loan/agent-overflow /tmp/agent-overflow-backup.git

# Run BFG to remove the keypair from all history
bfg --delete-files ao_escrow_v7-keypair.json

# Clean up git refs
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# ⚠️ STOP HERE. Tell CKL you're ready for the force push.
# CKL must confirm before the next command.
```

### Step 0d — Force push (ONLY after CKL confirms)

```bash
git push --force
```

### Step 0e — Verify keypair is gone from history

```bash
git log --all --full-history -- "*keypair*"
# Should return NOTHING
```

### Step 0f — ⛔ STOP — Final approval gate before going public

**Do NOT make the repo public yourself.**

Before any of this is public, both CKL and the Claude Code agent do a final review:

1. You finish Task 0 steps 0a–0e (commit + BFG purge, NOT force push yet)
2. Message CKL: "Repo cleanup done, ready for final review"
3. CKL + Claude Code agent review:
   - No secrets in history (`git log --all --full-history -- "*keypair*" "*secret*" "*.env"`)
   - Private docs gitignored (`git ls-files docs/human docs/social` — should return nothing)
   - .env.example has no real values
   - README exists and is accurate
4. CKL gives explicit green light: **"go"**
5. Only then: `git push --force` + make repo public on GitHub

**You can work on Task 1 and Task 2 while waiting for the review.**

---

## Tasks 1 and 2 follow below — do NOT start until Task 0 is confirmed ✅

**Priority order after Task 0:**
1. Task 1 — SAT + graph_coloring on-chain (HIGH — affects demo TXs, 2-3 hrs)
2. Task 2 — VulnerableVault exploit demo (LOW — only if time permits)

---

## Task 2 — Deploy VulnerableVault + exploit_sim verifier (3-4 hrs, LOW PRIORITY)

**Why:** Proper smart contract exploit POC for demo. Agent reads source code,
finds magic number, submits it. Platform SIMULATES the exploit on the live
contract, verifies vault drains, pays USDC. Math is the judge.

### Step 1 — Create the Anchor program (~1 hr)

Create `programs/vulnerable-vault/` in the repo. Minimal program, one instruction.

```toml
# programs/vulnerable-vault/Cargo.toml
[package]
name = "vulnerable-vault"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "vulnerable_vault"

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

```rust
// programs/vulnerable-vault/src/lib.rs
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("REPLACE_AFTER_DEPLOY");

#[program]
pub mod vulnerable_vault {
    use super::*;

    /// Initialize the vault with some USDC
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    /// Withdraw — has a backdoor
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // BACKDOOR: if you know the magic number, drain everything
        if amount == 31337 {
            let vault_balance = ctx.accounts.vault.amount;
            let bump = ctx.bumps.vault_authority;
            let seeds = &[b"vault_authority".as_ref(), &[bump]];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.caller_ata.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer,
            );
            token::transfer(cpi_ctx, vault_balance)?;
            return Ok(());
        }
        // Normal path: check balance
        require!(ctx.accounts.vault.amount >= amount, VaultError::InsufficientFunds);
        // ... normal transfer (omitted for brevity)
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = vault_authority,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: SystemAccount<'info>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: SystemAccount<'info>,
    #[account(mut)]
    pub caller_ata: Account<'info, TokenAccount>,
    pub caller: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum VaultError {
    InsufficientFunds,
}
```

### Step 2 — Deploy + fund (~30 min)

```bash
# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Note the program ID printed — update declare_id! and rebuild

# Fund the vault with 5 devnet USDC
# (use the faucet keypair as the initializer)
# Record: PROGRAM_ID and VAULT_TOKEN_ACCOUNT address
```

### Step 3 — Add exploit_sim verifier (web dev can do this in parallel, ~1-2 hrs)

**Files:** `app/src/lib/solana/verifiers.ts` and `app/src/app/api/bounties/crypto/[id]/submit/route.ts`

Add type 10 to `VERIFIER_TYPES`:
```typescript
exploit_sim: 10,
```

Add to `TS_ONLY_VERIFIERS`:
```typescript
export const TS_ONLY_VERIFIERS = new Set([8, 10]);
```

Add serialize config case:
```typescript
case "exploit_sim": {
  const { programId, vaultAccount } = config as { programId: string; vaultAccount: string };
  return Buffer.from(JSON.stringify({ programId, vaultAccount }), "utf8");
}
```

Add verify function (in `verifyInTypeScript` switch):
```typescript
case 10: return verifyExploitSim(configBuf, solution);
```

The verify function:
```typescript
async function verifyExploitSim(config: Buffer, solution: string): Promise<string | null> {
  try {
    const { programId, vaultAccount } = JSON.parse(config.toString("utf8"));
    const amount = BigInt(solution.trim());
    const conn = getConnection();

    // Check vault has funds
    const before = await conn.getTokenAccountBalance(new PublicKey(vaultAccount));
    if (BigInt(before.value.amount) === 0n) return "Vault already empty";

    // Build the withdraw instruction
    // Anchor discriminator for "withdraw": first 8 bytes of sha256("global:withdraw")
    const discriminator = Buffer.from([183, 18, 70, 156, 148, 109, 161, 34]);
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(amount);

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")], new PublicKey(programId)
    );
    const [vaultAuth] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority")], new PublicKey(programId)
    );

    // Use a dummy caller for simulation
    const dummyCaller = Keypair.generate();
    const ix = new TransactionInstruction({
      programId: new PublicKey(programId),
      keys: [
        { pubkey: vaultPda,               isSigner: false, isWritable: true  },
        { pubkey: vaultAuth,              isSigner: false, isWritable: false },
        { pubkey: new PublicKey(vaultAccount), isSigner: false, isWritable: true },
        { pubkey: dummyCaller.publicKey,  isSigner: true,  isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID,       isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([discriminator, amountBuf]),
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = dummyCaller.publicKey;
    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    const sim = await conn.simulateTransaction(tx, [dummyCaller]);
    if (sim.value.err) {
      // Check if it's JUST insufficient funds for the caller (expected in sim)
      // The key check is: did the vault token balance change in simulation?
      const postBals = sim.value.postTokenBalances ?? [];
      const vaultPost = postBals.find(b => b.accountIndex === 0);
      if (vaultPost && BigInt(vaultPost.uiTokenAmount.amount) === 0n) {
        return null; // Vault drained — exploit works!
      }
      return `Exploit simulation failed: ${JSON.stringify(sim.value.err)}`;
    }

    // Check vault balance change
    const postBals = sim.value.postTokenBalances ?? [];
    const vaultPost = postBals.find(b => b.accountIndex === 0);
    if (vaultPost && BigInt(vaultPost.uiTokenAmount.amount) === 0n) {
      return null; // ✓ Vault drained
    }

    return `Vault not drained — wrong magic number`;
  } catch (e: any) {
    return `Exploit simulation error: ${e.message}`;
  }
}
```

### Step 4 — Post the bounty

Once deployed, post via API:
```bash
PROGRAM_ID="YOUR_DEPLOYED_PROGRAM_ID"
VAULT_ACCOUNT="VAULT_TOKEN_ACCOUNT_ADDRESS"
KEY="ao_qS_W0Bk_csf0DDoY3RoHbLUiYFeXKxwB"

curl -X POST https://agentoverflow-app.vercel.app/api/bounties/crypto \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"questionId\": \"cmp1pce14000804leplg26uoz\",
    \"amount\": 10,
    \"verifier\": {
      \"type\": \"exploit_sim\",
      \"config\": {
        \"programId\": \"$PROGRAM_ID\",
        \"vaultAccount\": \"$VAULT_ACCOUNT\"
      }
    },
    \"deadline\": \"2026-07-01T00:00:00Z\"
  }"
```

This replaces the existing hash_preimage bounty on that question.

---

## Task 1 — On-chain verifiers for SAT + graph_coloring (HIGH PRIORITY, 2-3 hrs)

Hash_preimage is already done (real vault release). SAT and graph_coloring still
use the pass-through path. Add them to the Anchor program.

Full spec: `docs/tasks/ONCHAIN_VERIFIERS_SPEC.md`

Short version: add `verify_sat()` and `verify_graph_coloring()` Rust functions
to `programs/ao-escrow/src/lib.rs`, matching the TypeScript implementations in
`app/src/lib/solana/verifiers.ts` exactly. Then remove 6 and 7 from
`TS_ONLY_VERIFIERS` in TypeScript.

**Estimate:** 2-3 hrs if exploit_sim is done first.

---

## What to tell CKL when done

1. VulnerableVault program ID + vault token account address
2. Confirm exploit_sim verifier deployed + bounty re-posted
3. Confirm SAT/graph_coloring are on-chain (if done)
