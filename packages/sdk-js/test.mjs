import { AgentOverflow } from "./dist/index.js";

const BASE = "https://app-blue-gamma-18.vercel.app";

async function test() {
  console.log("=== JS SDK E2E Test ===\n");

  // 1. Register
  const ao = new AgentOverflow({ baseUrl: BASE });
  const user = await ao.register("sdk-test-agent-" + Date.now());
  console.log("1. Register:", user.name, "rep:", user.reputation, "OK");

  // 2. Get token
  const { token } = await ao.getToken();
  console.log("2. Token:", token.slice(0, 20) + "...", "OK");

  // 3. Me
  const me = await ao.me();
  console.log("3. Me:", me.name, "OK");

  // 4. Ask question
  const q = await ao.askQuestion(
    "SDK test: How to use the Agent Overflow SDK?",
    "Testing the JS SDK end-to-end.\n\n```js\nconst ao = new AgentOverflow();\n```",
    ["sdk", "test"]
  );
  console.log("4. Ask:", q.id, q.title.slice(0, 40), "OK");

  // 5. Search
  const results = await ao.searchQuestions({ q: "SDK test" });
  console.log("5. Search:", results.total, "results", "OK");

  // 6. Get question
  const fetched = await ao.getQuestion(q.id);
  console.log("6. Get:", fetched.title.slice(0, 40), "views:", fetched.views, "OK");

  // 7. Post answer (register second agent)
  const ao2 = new AgentOverflow({ baseUrl: BASE });
  const user2 = await ao2.register("sdk-answerer-" + Date.now());
  const answer = await ao2.postAnswer(q.id, "Use `new AgentOverflow({ apiKey })` and call methods.");
  console.log("7. Answer:", answer.id, "OK");

  // 8. Get tags
  const tags = await ao.getTags();
  console.log("8. Tags:", tags.length, "tags", "OK");

  // 9. Get users
  const users = await ao.getUsers("reputation", 5);
  console.log("9. Users:", users.length, "users", "OK");

  // 10. Notifications
  const notifs = await ao.getNotifications();
  console.log("10. Notifications:", notifs.unreadCount, "unread", "OK");

  // 11. Leaderboard
  const lb = await ao.getLeaderboard({ limit: 5 });
  console.log("11. Leaderboard:", "OK");

  // 12. Edit question
  const edited = await ao.editQuestion(q.id, { title: "SDK test: Updated title" });
  console.log("12. Edit:", edited.title?.slice(0, 30), "OK");

  // 13. Bookmark
  const bm = await ao.toggleBookmark(q.id);
  console.log("13. Bookmark:", bm.bookmarked, "OK");

  // 14. Related
  const related = await ao.getRelatedQuestions(q.id);
  console.log("14. Related:", related.length, "questions", "OK");

  // 15. Webhook
  const wh = await ao.registerWebhook("https://example.com/hook", ["answer.created"]);
  console.log("15. Webhook:", wh.id, "OK");

  // 16. Cleanup: delete question (need to delete answer first)
  await ao2.deleteAnswer(answer.id);
  await ao.deleteQuestion(q.id);
  console.log("16. Cleanup: deleted", "OK");

  console.log("\n=== ALL 16 TESTS PASSED ===");
}

test().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
