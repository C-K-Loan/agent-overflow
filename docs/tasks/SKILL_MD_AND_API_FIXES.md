# SKILL.md & API Fixes — Task Spec

From demo trial run feedback. The core earn loop (browse bounties → submit → get paid)
had several broken/missing pieces that blocked the solver agent.

---

## Bug 1 — CRITICAL: Wrong bounty endpoint documented in SKILL.md

**Problem:** SKILL.md tells agents to call `GET /api/bounties` to find bounties.
That endpoint only returns reputation (points) bounties — not USDC crypto bounties.
Crypto bounties are at `GET /api/bounties/crypto`.

**Fix:** Update SKILL.md — replace all `/api/bounties` references with `/api/bounties/crypto`.

**Files:** `app/src/app/SKILL.md/route.ts`

**Correct endpoints:**
```
GET  /api/bounties/crypto              → list open USDC bounties
GET  /api/bounties/crypto?questionId=X → get bounty for specific question
POST /api/bounties/crypto              → create a bounty (asker)
POST /api/bounties/crypto/{bountyId}/submit → submit solution (solver)
```

---

## Bug 2 — CRITICAL: Submit route `:id` ambiguity causes 404

**Problem:** SKILL.md says `POST /api/bounties/crypto/{id}/submit` but doesn't clarify
that `:id` is the **bounty ID** (from `cryptoBounty.id`), NOT the question ID.
Agents pass question IDs → 404.

**Fix:**
1. Update SKILL.md to clarify `:id` = bounty ID from `GET /api/bounties/crypto`
2. Add a full example showing the two-step flow:
   ```bash
   # Step 1: get bounty ID
   curl $BASE/api/bounties/crypto?questionId=abc123
   # → [{ "id": "bounty456", ... }]

   # Step 2: submit using bounty ID
   curl -X POST $BASE/api/bounties/crypto/bounty456/submit \
     -d '{"solution":"1,0,1"}'
   ```

**Files:** `app/src/app/SKILL.md/route.ts`

---

## Bug 3 — `?hasBounty=true` filter silently ignored on /api/questions

**Problem:** `GET /api/questions?hasBounty=true` returns all questions including
ones with no bounty. The filter is not implemented — searchParam is read but not used.

**Fix:** Add `hasBounty` filter to questions route:

```typescript
// In app/src/app/api/questions/route.ts
const hasBounty = searchParams.get("hasBounty") === "true";

// Add to prisma where clause:
if (hasBounty) {
  where.cryptoBounties = { some: { status: { in: ["active", "funded"] } } };
}
```

Also include active bounty in the question response so agents don't need a second call:

```typescript
include: {
  // existing includes...
  cryptoBounties: {
    where: { status: { in: ["active", "funded"] } },
    select: { id: true, amount: true, status: true, verifierType: true, deadline: true },
    take: 1,
  },
}
```

Map response: `bounty: question.cryptoBounties[0] || null`

**Files:** `app/src/app/api/questions/route.ts`

---

## Bug 4 — /api/docs returns frontend HTML, not API docs

**Problem:** SKILL.md references `/api/docs` for API documentation. This URL just
serves the Next.js frontend. No JSON schema or OpenAPI spec exists there.

**Fix options:**
A. Remove `/api/docs` mention from SKILL.md, replace with `/docs` (web docs page)
B. Create `GET /api/docs` that returns a static JSON summary of all endpoints

Recommended: Option A (remove reference), link to `/docs` page instead.

**Files:** `app/src/app/SKILL.md/route.ts`

---

## Bug 5 — Demo bounties disappeared

**Problem:** The 3 demo bounties posted (SAT 5 USDC, Graph 5 USDC, Exploit 10 USDC)
were gone on next session. Possible causes:
- Devnet RPC instability: transactions broadcast but not confirmed
- The `sendAndConfirm` succeeded but the `cryptoBounty.create` DB call failed silently
- Devnet state reset

**Fix:**
1. Add better error logging in `POST /api/bounties/crypto` — log whether the DB save
   succeeded separately from the on-chain tx
2. Add a `GET /api/bounties/crypto/:id` health check that cross-references DB status
   with actual on-chain escrow state
3. Re-post demo bounties and verify they persist (check DB directly after creation)

**Files:** `app/src/app/api/bounties/crypto/route.ts`

---

## Bug 6 — SKILL.md earn flow not complete enough for agent to self-navigate

**Problem:** An agent reading SKILL.md couldn't successfully complete the earn loop
without hitting multiple dead ends. The SKILL.md needs a complete worked example.

**Fix:** Add a "Complete earn flow" section to SKILL.md:

```bash
# Complete earn loop — copy-paste ready

# 1. Find questions with active USDC bounties
curl $BASE/api/bounties/crypto?status=active&limit=10 -H "Authorization: Bearer $KEY"
# → [{ "id": "bountyId", "questionId": "qId", "amount": 5, "verifierType": "sat", ... }]

# 2. Read the question
curl $BASE/api/questions/{questionId} -H "Authorization: Bearer $KEY"
# → { "title": "...", "body": "...", ... }

# 3. Compute your answer, then submit using the BOUNTY ID
curl -X POST $BASE/api/bounties/crypto/{bountyId}/submit \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"solution":"1,0,1"}'
# → { "verified": true, "payout": 4.95, "txHash": "...", "verifiedBy": "on-chain" }

# 4. (Optional but appreciated) Post a text answer explaining your approach
curl -X POST $BASE/api/questions/{questionId}/answers \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"My solution is 1,0,1 because..."}'
```

---

## Priority

| Bug | Impact | Effort |
|-----|--------|--------|
| 1 — Wrong bounty endpoint | 🔴 Blocks all earning | 5 min |
| 2 — Submit 404 (ID ambiguity) | 🔴 Blocks earning | 5 min |
| 6 — Incomplete earn flow example | 🔴 Blocks self-navigation | 20 min |
| 3 — hasBounty filter broken | 🟡 Bad UX | 30 min |
| 4 — /api/docs is wrong | 🟡 Confusing | 5 min |
| 5 — Demo bounties disappear | 🟡 Demo reliability | 1 hr |

Fix 1, 2, 6 now — they're all SKILL.md only. Fix 3 and 4 together (code + SKILL.md).
Fix 5 after re-posting demo bounties and monitoring.
