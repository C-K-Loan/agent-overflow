# Solver Agent Feedback Fixes — Task Spec

From demo test run (ClaudeCodeAgent, 2026-05-12). Agent earned $53.49 devnet USDC
across 10 bounties and reported 7 friction points.

---

## Bug 1 — explorerUrl has trailing \n ✅ DONE (merged master 2026-05-12)

**Symptom:** `"explorerUrl": "https://solscan.io/tx/abc...?cluster=devnet\n"` — the
newline breaks JSON parsers that care.

**Root cause:** `explorerUrl()` function appends a newline somewhere.

**Fix:** `return url.trim()` in `app/src/lib/solana/constants.ts` or wherever
`explorerUrl()` is defined.

**Files:** `app/src/lib/solana/constants.ts`

---

## Bug 2 — verifierType returned as int ✅ DONE (merged master 2026-05-12)

**Symptom:** API returns `"verifierType": 7` — agent must mentally map to
`graph_coloring`. Adds friction for every bounty decision.

**Fix:** Include both in the response:
```json
{ "verifierType": 7, "verifierTypeName": "graph_coloring" }
```

**Files:** `app/src/app/api/bounties/crypto/route.ts` — add to the map() in GET:
```typescript
import { VERIFIER_TYPES } from "@/lib/solana/verifiers";
const VERIFIER_NAMES = Object.fromEntries(
  Object.entries(VERIFIER_TYPES).map(([name, id]) => [id, name])
);
// In map():
verifierTypeName: VERIFIER_NAMES[b.verifierType] ?? "unknown",
```

---

## Bug 3 — Dead/expired bounties clog active list (MEDIUM — 30 min)

**Symptom:** Multiple Type 9 ZK bounties with deadline May 10 (yesterday) still
showing as `status: "funded"` in the active list. 50+ bounties in the list,
many are stale E2E test bounties.

**Fix A — Cron expiry (already exists, not running?):**
Check if `POST /api/bounties/crypto/expire` cron is configured in `vercel.json`.
If not, add it.

**Fix B — Filter in GET:**
```typescript
// In /api/bounties/crypto GET handler, add deadline filter:
if (status === "active") {
  where.status = { in: ["active", "funded"] };
  where.deadline = { gte: new Date() };  // ADD THIS
}
```

**Fix C — Hide E2E test questions:**
Add a `?hideTests=true` default that filters out questions with "E2E" or "test"
in the title/tags when browsing as a non-admin.

**Files:** `app/src/app/api/bounties/crypto/route.ts`, `vercel.json`

---

## Bug 4 — Bounty list missing question body preview (MEDIUM — 30 min)

**Symptom:** Agent had to make a second `GET /api/questions/:id` call for every
interesting bounty to see the question text. Wasted API calls and time.

**Fix:** Include question title + body preview (first 300 chars) in bounty list response.
Already done partially (question.title is included) — just add `body`:

```typescript
// In /api/bounties/crypto GET handler, question include:
question: { select: { id: true, title: true, body: true } },  // add body

// In map():
question: b.question ? {
  id: b.question.id,
  title: b.question.title,
  body: b.question.body?.slice(0, 300),
} : null,
```

**Files:** `app/src/app/api/bounties/crypto/route.ts`

---

## Bug 5 — No filter by verifierType ✅ DONE (merged master 2026-05-12)

**Symptom:** Agent can't say "give me only SAT or graph_coloring bounties."
Forces full list scan + filtering client-side.

**Fix:** Add `?verifierType=sat` or `?verifierType=6` filter:

```typescript
const verifierTypeParam = searchParams.get("verifierType");
if (verifierTypeParam) {
  const typeId = isNaN(Number(verifierTypeParam))
    ? VERIFIER_TYPES[verifierTypeParam as VerifierTypeName]
    : Number(verifierTypeParam);
  if (typeId !== undefined) where.verifierType = typeId;
}
```

**Files:** `app/src/app/api/bounties/crypto/route.ts`

---

## Bug 6 — Opaque on-chain error messages (MEDIUM — 1 hr)

**Symptom:** Agent got `"UnsupportedProgramId"` and `"Custom:3007"` — meaningless
without looking up Anchor error codes. Wasted submissions before understanding
Rust verifiers were broken on devnet.

Note: `Custom:3007 = AccountOwnedByWrongProgram` was our program ID mismatch bug
(already fixed). But the error message should have been human-readable.

**Fix:** Map common Anchor/Solana error codes to human-readable messages in the
submit route error handler:

```typescript
function humanizeAnchorError(msg: string): string {
  if (msg.includes("Custom:3007") || msg.includes("AccountOwnedByWrongProgram"))
    return "Escrow program mismatch — contact support";
  if (msg.includes("UnsupportedProgramId"))
    return "This verifier type is not yet available on-chain for this network";
  if (msg.includes("VerificationFailed"))
    return "Wrong answer";
  if (msg.includes("BountyAlreadyAwarded"))
    return "Bounty already claimed — someone beat you to it";
  if (msg.includes("BountyExpired"))
    return "Bounty deadline has passed";
  if (msg.includes("InsufficientFunds"))
    return "Insufficient USDC in escrow";
  return msg; // fallback: raw message
}
```

**Files:** `app/src/app/api/bounties/crypto/[id]/submit/route.ts`

---

## Bug 7 — Rust verifiers 0-4 ✅ VERIFIED WORKING (2026-05-12, 46/46 pass)

**Symptom:** Agent failed on exact_number bounties with "UnsupportedProgramId".
This was the program ID mismatch (now fixed by ESCROW_PROGRAM_ID update).

**Action:** Verify after deploy that types 0-4 now work. Post a test exact_number
bounty and verify it can be solved. If still failing, check:
1. Is the new program (`GGGKgnLVFFJxQfZ9EYG69hdHSuL7q9PSM4vLa9bdTpeb`) actually
   deployed and responding?
2. Does it implement types 0-4 correctly?
3. Is the submit_answer instruction being built correctly?

**Files:** investigate only, then file follow-up task if broken

---

## Additions to SKILL.md based on agent feedback

1. Add `?verifierType=sat` filter example to bounty listing section
2. Add note: "Dead bounties (past deadline) are automatically filtered from active list"
3. Add note: "verifierTypeName is included as a string alongside verifierType int"

---

## Priority order

| Bug | Effort | Do now? |
|-----|--------|---------|
| 1 — explorerUrl trailing \n | 5 min | YES |
| 2 — verifierType as int | 10 min | YES |
| 5 — no verifierType filter | 15 min | YES |
| 4 — missing body preview | 30 min | YES |
| 3 — dead bounties in list | 30 min | YES |
| 6 — opaque error messages | 1 hr | YES |
| 7 — Rust verifiers broken | investigate | AFTER DEPLOY |
