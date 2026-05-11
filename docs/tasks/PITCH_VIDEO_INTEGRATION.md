# Pitch Video Integration — Task Spec

Video ready: `/home/ckl/Videos/agent-overflow-pitch.mp4` (26MB)

---

## Step 1 — Host the video (5 min, no code)

**Use GitHub Releases** — free, permanent CDN URL, no streaming limits.

```bash
# Create a release and upload the video
gh release create v1.0-pitch \
  /home/ckl/Videos/agent-overflow-pitch.mp4 \
  --title "Agent Overflow — Frontier Hackathon Pitch" \
  --notes "Colosseum Frontier 2026 pitch video" \
  --repo C-K-Loan/agent-overflow
```

This gives a permanent URL like:
```
https://github.com/C-K-Loan/agent-overflow/releases/download/v1.0-pitch/agent-overflow-pitch.mp4
```

**Alternative (if > 2GB or want streaming):** upload to YouTube as Unlisted.
Gets an embed URL and works everywhere. 26MB is fine for GitHub though.

---

## Step 2 — Wire up the pitch page buttons (15 min)

The two greyed-out buttons in `/pitch` header already exist, just need `href`:

**File:** `app/src/app/pitch/page.tsx`

Find the two disabled anchor tags and replace `href="#"` with the real URLs:

```tsx
// Pitch Video button
<a href="https://github.com/C-K-Loan/agent-overflow/releases/download/v1.0-pitch/agent-overflow-pitch.mp4"
   target="_blank" rel="noopener noreferrer"
   className="text-xs font-mono px-3 py-1 rounded-full border hover:opacity-80 transition-opacity"
   style={{ color: "#ABABBA", borderColor: "#2a2a2a", background: "#0d0d0d" }}>
  Pitch Video ↗
</a>
```

Also remove the `opacity-40 cursor-not-allowed` classes from both buttons once wired.

---

## Step 3 — Landing page video section (30 min)

Add a video section to the home page (`app/src/app/page.tsx`) — a simple
autoplay-muted loop or a click-to-play embed, positioned above the fold or
just below the hero.

**Option A — Native video embed (best for GitHub-hosted MP4):**
```tsx
<section className="max-w-4xl mx-auto px-4 py-12">
  <h2 className="text-2xl font-bold mb-4 text-center">See it in action</h2>
  <video
    src="https://github.com/C-K-Loan/agent-overflow/releases/download/v1.0-pitch/agent-overflow-pitch.mp4"
    controls
    poster="/logo-512.png"
    className="w-full rounded-2xl border border-[var(--border)] shadow-lg"
  />
</section>
```

**Option B — YouTube embed (if uploaded to YouTube):**
```tsx
<iframe
  src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
  className="w-full aspect-video rounded-2xl"
  allow="autoplay; encrypted-media"
  allowFullScreen
/>
```

Recommendation: **Option A** for now (instant, no YouTube account needed),
swap to Option B if video gets popular (better streaming, analytics).

---

## Step 4 — Colosseum submission link update (5 min)

Once video is hosted, update `docs/tasks/SUPERTEAM_SUBMISSIONS.md`:

```
**Demo video:** https://github.com/C-K-Loan/agent-overflow/releases/download/v1.0-pitch/agent-overflow-pitch.mp4
```

Paste same URL into every Superteam Earn submission form.

---

## Priority order

1. `gh release create` — 5 min, gets the URL, unblocks everything else
2. Wire up pitch page buttons — 15 min
3. Update Superteam submission forms — 5 min
4. Landing page video section — 30 min (nice but not blocking submissions)

---

## Files to touch

| File | Change |
|------|--------|
| `app/src/app/pitch/page.tsx` | Wire Pitch Video + Demo Video buttons |
| `app/src/app/page.tsx` | Add video section to landing page |
| `docs/tasks/SUPERTEAM_SUBMISSIONS.md` | Add demo video URL |
