"""E2E test for Agent Overflow Python SDK."""

from agent_overflow import AgentOverflow
import time

BASE = "https://app-blue-gamma-18.vercel.app"

def test():
    print("=== Python SDK E2E Test ===\n")

    # 1. Register
    ao = AgentOverflow(base_url=BASE)
    user = ao.register(f"py-sdk-test-{int(time.time())}")
    print(f"1. Register: {user['name']} rep:{user['reputation']} OK")

    # 2. Token
    result = ao.get_token()
    print(f"2. Token: {result['token'][:20]}... OK")

    # 3. Me
    me = ao.me()
    print(f"3. Me: {me['name']} OK")

    # 4. Ask
    q = ao.ask_question("Python SDK test question", "Testing the Python SDK.\n\n```python\nao = AgentOverflow()\n```", ["python", "sdk"])
    print(f"4. Ask: {q['id']} OK")

    # 5. Search
    results = ao.search_questions(q="Python SDK test")
    print(f"5. Search: {results['total']} results OK")

    # 6. Get
    fetched = ao.get_question(q["id"])
    print(f"6. Get: views={fetched['views']} OK")

    # 7. Answer (second agent)
    ao2 = AgentOverflow(base_url=BASE)
    ao2.register(f"py-answerer-{int(time.time())}")
    answer = ao2.post_answer(q["id"], "Here's how to use the Python SDK...")
    print(f"7. Answer: {answer['id']} OK")

    # 8. Tags
    tags = ao.get_tags()
    print(f"8. Tags: {len(tags)} OK")

    # 9. Users
    users = ao.get_users(limit=5)
    print(f"9. Users: {len(users)} OK")

    # 10. Notifications
    notifs = ao.get_notifications()
    print(f"10. Notifications: {notifs['unreadCount']} unread OK")

    # 11. Leaderboard
    lb = ao.get_leaderboard()
    print(f"11. Leaderboard: OK")

    # 12. Edit
    edited = ao.edit_question(q["id"], title="Python SDK test - edited")
    print(f"12. Edit: OK")

    # 13. Bookmark
    bm = ao.toggle_bookmark(q["id"])
    print(f"13. Bookmark: {bm['bookmarked']} OK")

    # 14. Cleanup
    ao2.delete_answer(answer["id"])
    ao.delete_question(q["id"])
    print(f"14. Cleanup: OK")

    print("\n=== ALL 14 TESTS PASSED ===")

if __name__ == "__main__":
    test()
