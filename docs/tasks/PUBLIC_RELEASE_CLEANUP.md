# Public Release Cleanup — Task Spec

**Goal:** Make the repo safe to go public on GitHub.
**IMPORTANT:** Do NOT touch `feat/zk-drug-scorer` branch — Solana dev and frontend dev still working.
**IMPORTANT:** Do NOT merge any branches without explicit approval.

---

## Already Done ✅ (updated 2026-05-12)

- `ao_escrow_v7-keypair.json` removed from tracking + committed (Step 1 ✅)
- `target/`, `/*.png`, `/*.jpg` added to .gitignore (Step 3 ✅)
- JWT_SECRET: throws at runtime if missing (Step 4 ✅)
- payment-gate.ts: hardcoded devnet refs → constants (Step 4 ✅)
- .env.example: added NEXT_PUBLIC_SOLANA_NETWORK + NEXT_PUBLIC_SOLANA_RPC_URL (Step 4 ✅)
- verifiers 5-7: real vault release merged to master
- SKILL.md, API UX fixes (explorerUrl, verifierTypeName, filter) merged
- Stale branches deleted: `lifi`, `feat/sp1-zk-verifier`, `fix/ts-only-verifier-vault`
- 46/46 e2e tests pass

## ⏳ Pending (needs CKL green light)

- Step 2: BFG history purge (keypair still in history)
- Step 8: npm audit critical fixes
- Step 6: merge + delete `feat/zk-drug-scorer` when ready

---

## Step 1 — Commit the keypair removal + .gitignore fix

These changes are staged but not committed. Safe to commit:

```bash
git add app/target/deploy/ao_escrow_v7-keypair.json .gitignore
git commit -m "security: remove deploy keypair from tracking, add target/ to .gitignore"
```

Verify keypair is not tracked after commit:
```bash
git ls-files | grep keypair  # should return nothing
```

---

## Step 2 — Purge keypair from git HISTORY (before going public)

The keypair was committed in `6a7e28a feat: LI.FI cross-chain bridge integration`.
Even though it's untracked now, git history still contains it.

⚠️ This is destructive — requires force push. Do this LAST, after all devs have pushed their work.

```bash
# Option A: BFG Repo Cleaner (recommended, faster)
# Install: https://rtyley.github.io/bfg-repo-cleaner/
bfg --delete-files ao_escrow_v7-keypair.json
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force

# Option B: git filter-repo
git filter-repo --path app/target/deploy/ao_escrow_v7-keypair.json --invert-paths
git push --force
```

**Coordinate with all devs before running this** — force push rewrites history and everyone needs to re-clone or hard reset.

---

## Step 3 — Scrub loose screenshots from repo root

Several `.png` files landed in the repo root from Playwright sessions.
They're untracked but should be added to .gitignore:

```bash
echo "*.png" >> .gitignore   # OR add specific patterns
echo "*.jpg" >> .gitignore
# BUT: check public/ folder has logo.png etc that SHOULD be tracked
# So use: root-level only, or list them explicitly
```

Or just confirm they're all in `.gitignore` already via `git status`.

---

## Step 4 — Review .env.example is complete

Before going public, make sure `.env.example` documents ALL required env vars.
Current gaps to verify:
- [ ] `HELIUS_API_KEY` — is this needed? Check if referenced anywhere
- [ ] `LIFI_*` — any LI.FI API keys needed?
- [ ] `PAY_SH_*` — pay.sh integration keys?

```bash
grep -r "process\.env\." app/src/ | grep -v "node_modules" | \
  grep -oP 'process\.env\.\K[A-Z_]+' | sort -u
```

Compare output against `.env.example` keys. Add any missing ones with placeholder values.

---

## Step 5 — Check for other secrets in history

Before going public, run a full history scan:

```bash
# Install: pip install truffleHog
trufflehog git file://. --only-verified

# Or simpler:
git log --all --full-history --source -- "*.json" | grep -i "keypair\|secret\|private"
```

---

## Step 6 — Branch cleanup (AFTER devs finish)

Current branches:
- `master` — production ✅
- `feat/zk-drug-scorer` — ACTIVE, do not touch ⚠️

When `feat/zk-drug-scorer` is ready:
```bash
git checkout master
git merge feat/zk-drug-scorer
git push origin master
git push origin --delete feat/zk-drug-scorer
```

---

## Step 7 — GitHub repo settings

Before making public:
- [ ] Add `LICENSE` file (MIT — already in codebase, verify)
- [ ] Add `CONTRIBUTING.md` (tracked already ✅)
- [ ] Set up Dependabot alerts (74 vulnerabilities flagged — address critical ones)
- [ ] Add branch protection on `master` (require PR, no force push after public)
- [ ] Add `README.md` with: what it is, how to run, env setup, link to live site

---

## Step 8 — Critical Dependabot alerts

GitHub flagged: 1 critical, 18 high, 47 moderate, 8 low vulnerabilities.

```bash
cd app && npm audit --audit-level=critical
```

Fix critical ones before going public. High ones: fix where possible, document known exceptions.

---

## Priority order

1. Commit keypair removal (Step 1) — safe now
2. Fill .env.example gaps (Step 4) — safe now  
3. Address critical npm audit (Step 8) — safe now
4. BFG history purge (Step 2) — LAST, coordinate with all devs
5. Branch cleanup (Step 6) — after zk-drug-scorer done

