# Local Repo Cleanup — Task Spec

Clean up junk files that accumulated during development.
Goal: local repo matches what should be there. No screenshots, no temp files, no stale artifacts.

---

## Step 1 — Check untracked files

```bash
cd /home/ckl/Agent/agent-overflow
git status --short | grep "^??"
```

Go through the list. Delete anything that is clearly dev junk (screenshots, test outputs,
temp files, build artifacts). Keep: `zk-checkers/`, `docs/`, `scripts/`, legit new work.

---

## Step 2 — Delete Playwright screenshots

These accumulated from browser testing sessions. All safe to delete.

```bash
# Find all PNGs/JPGs outside of public/ and node_modules
find /home/ckl/Agent/agent-overflow -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \
  | grep -v "/public/" \
  | grep -v "/node_modules/" \
  | grep -v "/.git/"

# Delete them all
find /home/ckl/Agent/agent-overflow -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \
  | grep -v "/public/" \
  | grep -v "/node_modules/" \
  | grep -v "/.git/" \
  | xargs rm -f

echo "Done"
```

---

## Step 3 — Delete .playwright-mcp/ artifacts

Browser session snapshots from testing. Entire folder is safe to delete.

```bash
rm -rf /home/ckl/Agent/.playwright-mcp/
echo "Cleared .playwright-mcp/"
```

---

## Step 4 — Delete log/tmp/bak files

```bash
find /home/ckl/Agent/agent-overflow -maxdepth 3 \
  \( -name "*.log" -o -name "*.tmp" -o -name "*.bak" \) \
  ! -path "*/node_modules/*" \
  -delete -print
```

---

## Step 5 — Review docs/tasks/ for anything private that slipped through

```bash
git ls-files docs/tasks/
```

These are currently tracked (will be public). Review each file — flag anything that
looks internal. Anything with personal strategy, fundraising plans, or submission
tactics should NOT be public. Compare against `.gitignore` entries.

Currently gitignored (should NOT appear in the list above):
- MASTERPLAN.md
- ROADMAP-TO-10M.md
- SUPERTEAM_SUBMISSIONS.md
- hackathon-colosseum.md
- LAUNCH_TASKS.md
- WALLET_UX_FIXES.md
- PITCH_VIDEO_INTEGRATION.md
- PUBLIC_RELEASE_CLEANUP.md

If any of those appear in `git ls-files docs/tasks/` — run `git rm --cached docs/tasks/FILENAME.md` and commit.

---

## Step 6 — Check profile pics in public/

```bash
ls /home/ckl/Agent/agent-overflow/app/public/
```

These are intentional and tracked:
- `logo.png`, `logo-192.png`, `logo-512.png` — app logos ✅
- `ckl.png` — CKL profile pic for pitch deck ✅
- `muhammad.jpeg`, `sarti.jpg`, `stud.jpg` — honorable mentions ✅

If there are any unexpected files here, flag them.

---

## Step 7 — Final git status

```bash
cd /home/ckl/Agent/agent-overflow
git status --short
```

Expected result: only intentional untracked files remain (zk-checkers/, new task specs, etc.).
Nothing from Steps 1-4 should still appear.

---

## Step 8 — Report back

Tell CKL:
- What was deleted (counts + types)
- What untracked files remain and why they're kept
- Any private docs that slipped through gitignore

**Do NOT commit or push anything — this is local cleanup only.**
CKL reviews before anything goes to the repo.
