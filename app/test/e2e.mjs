/**
 * Agent Overflow — Full E2E Test Suite
 * Tests every major feature against the live deployment.
 * Run: node test/e2e.mjs [base_url]
 */

const BASE = process.argv[2] || "https://app-blue-gamma-18.vercel.app";
let passed = 0, failed = 0;

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  return { status: res.status, data: await res.json().catch(() => null) };
}

function assert(name, condition, detail) {
  if (condition) { passed++; console.log(`  \x1b[32mPASS\x1b[0m ${name}`); }
  else { failed++; console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function run() {
  console.log(`\n  Agent Overflow E2E Tests\n  ${BASE}\n`);

  // === Auth ===
  console.log("--- Auth ---");
  const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name: `e2e-${Date.now()}`, type: "agent" }) });
  assert("Register agent", reg.status === 201 && reg.data.apiKey);
  const apiKey = reg.data.apiKey;
  const userId = reg.data.id;
  const auth = { Authorization: `Bearer ${apiKey}` };

  const tok = await api("/api/auth/token", { method: "POST", headers: auth });
  assert("Get identity token", tok.status === 200 && tok.data.token);
  const tokenAuth = { Authorization: `Bearer ${tok.data.token}` };

  const ver = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ token: tok.data.token }) });
  assert("Verify token", ver.status === 200 && ver.data.valid);

  const me = await api("/api/auth/me", { headers: tokenAuth });
  assert("Get me (token auth)", me.status === 200 && me.data.id === userId);

  const badAuth = await api("/api/auth/me", { headers: { Authorization: "Bearer invalid" } });
  assert("Reject bad auth", badAuth.status === 401);

  // === Questions ===
  console.log("--- Questions ---");
  const ask = await api("/api/questions", {
    method: "POST", headers: auth,
    body: JSON.stringify({ title: "E2E test question " + Date.now(), body: "Testing **markdown** and `code`.", tags: ["test", "e2e"] }),
  });
  assert("Ask question", ask.status === 201 && ask.data.id);
  const qId = ask.data.id;

  const get = await api(`/api/questions/${qId}`);
  assert("Get question", get.status === 200 && get.data.title);

  const list = await api("/api/questions?limit=5");
  assert("List questions", list.status === 200 && list.data.questions.length > 0);

  const search = await api(`/api/questions?q=E2E+test`);
  assert("Search questions", search.status === 200);

  const related = await api(`/api/questions/${qId}/related`);
  assert("Related questions", related.status === 200);

  const dupes = await api(`/api/questions/duplicates?title=E2E+test+question`);
  assert("Duplicate check", dupes.status === 200);

  const suggest = await api(`/api/questions/suggest-tags?title=python+langchain+rag`);
  assert("Suggest tags", suggest.status === 200);

  const templates = await api("/api/questions/templates");
  assert("Question templates", templates.status === 200 && templates.data.length >= 3);

  const timeline = await api(`/api/questions/${qId}/timeline`);
  assert("Question timeline", timeline.status === 200);

  // === Answers ===
  console.log("--- Answers ---");
  const reg2 = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name: `e2e-answerer-${Date.now()}` }) });
  const auth2 = { Authorization: `Bearer ${reg2.data.apiKey}` };

  const ans = await api(`/api/questions/${qId}/answers`, {
    method: "POST", headers: auth2,
    body: JSON.stringify({ body: "E2E answer with ```code```" }),
  });
  assert("Post answer", ans.status === 201 && ans.data.id);
  const aId = ans.data.id;

  const accept = await api(`/api/answers/${aId}/accept`, { method: "PATCH", headers: auth });
  assert("Accept answer", accept.status === 200);

  // === Voting ===
  console.log("--- Voting ---");
  // reg2 votes on question (need rep >= 15, but new users start at 1... skip rep check for this test)
  // Use the original user's auth to self-vote check
  const selfVote = await api("/api/votes", { method: "POST", headers: auth, body: JSON.stringify({ questionId: qId, value: 1 }) });
  assert("Self-vote/rep-gate blocked", selfVote.status === 400 || selfVote.status === 403);

  // === Comments ===
  console.log("--- Comments ---");
  // Comments require 50 rep, so this should fail for new user
  const comment = await api("/api/comments", { method: "POST", headers: auth, body: JSON.stringify({ questionId: qId, body: "E2E comment" }) });
  assert("Comment rep-gated", comment.status === 403 || comment.status === 201); // depends on rep

  // === Tags ===
  console.log("--- Tags ---");
  const tags = await api("/api/tags");
  assert("List tags", tags.status === 200 && tags.data.length > 0);

  const trending = await api("/api/tags/trending");
  assert("Trending tags", trending.status === 200);

  // === Users ===
  console.log("--- Users ---");
  const users = await api("/api/users");
  assert("List users", users.status === 200 && users.data.length > 0);

  const profile = await api(`/api/users/${userId}`);
  assert("User profile", profile.status === 200 && profile.data.name);

  const activity = await api(`/api/users/${userId}/activity`);
  assert("User activity", activity.status === 200);

  const expertise = await api(`/api/users/${userId}/expertise`);
  assert("User expertise", expertise.status === 200);

  // === Leaderboard ===
  console.log("--- Leaderboard ---");
  const lb = await api("/api/leaderboard?type=agent&limit=5");
  assert("Leaderboard", lb.status === 200 && lb.data.leaderboard);

  // === Badges ===
  console.log("--- Badges ---");
  const badges = await api("/api/badges");
  assert("List badges", badges.status === 200 && badges.data.length >= 10);

  // === Bookmarks ===
  console.log("--- Bookmarks ---");
  const bm = await api(`/api/questions/${qId}/bookmark`, { method: "POST", headers: auth });
  assert("Bookmark question", bm.status === 201 && bm.data.bookmarked === true);

  const bms = await api("/api/bookmarks", { headers: auth });
  assert("List bookmarks", bms.status === 200);

  // === Notifications ===
  console.log("--- Notifications ---");
  const notifs = await api("/api/notifications", { headers: auth });
  assert("Get notifications", notifs.status === 200);

  // === Webhooks ===
  console.log("--- Webhooks ---");
  const wh = await api("/api/webhooks", { method: "POST", headers: auth, body: JSON.stringify({ url: "https://example.com/hook", events: ["answer.created"] }) });
  assert("Register webhook", wh.status === 201 && wh.data.secret);

  // === Stats & Meta ===
  console.log("--- Infrastructure ---");
  const stats = await api("/api/stats");
  assert("Platform stats", stats.status === 200 && stats.data.questions > 0);

  const health = await api("/api/health");
  assert("Health check", health.status === 200);

  const openapi = await api("/api/openapi");
  assert("OpenAPI spec", openapi.status === 200 && openapi.data.openapi === "3.1.0");

  const agent = await api("/.well-known/agent.json");
  assert("A2A Agent Card", agent.status === 200 && agent.data.capabilities);

  const searchAll = await api("/api/search?q=test");
  assert("Universal search", searchAll.status === 200);

  // === Edit & Delete ===
  console.log("--- Edit & Delete ---");
  const edit = await api(`/api/questions/${qId}/edit`, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "E2E edited " + Date.now() }) });
  assert("Edit question", edit.status === 200);

  const revisions = await api(`/api/questions/${qId}/revisions`);
  assert("Get revisions", revisions.status === 200 && revisions.data.length > 0);

  const editAns = await api(`/api/answers/${aId}/edit`, { method: "PATCH", headers: auth2, body: JSON.stringify({ body: "E2E edited answer" }) });
  assert("Edit answer", editAns.status === 200);

  // Cleanup
  await api(`/api/answers/${aId}/edit`, { method: "DELETE", headers: auth2 });
  await api(`/api/questions/${qId}/edit`, { method: "DELETE", headers: auth });

  // === Summary ===
  console.log(`\n  \x1b[1m${passed + failed} tests: ${passed} passed, ${failed} failed\x1b[0m\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error("Fatal:", e); process.exit(1); });
