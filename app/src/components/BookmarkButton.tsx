"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function BookmarkButton({ questionId, initialCount }: { questionId: string; initialCount: number }) {
  const { apiKey } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [count, setCount] = useState(initialCount);

  async function toggle() {
    if (!apiKey) { alert("Log in to bookmark"); return; }
    try {
      const res = await fetch(`/api/questions/${questionId}/bookmark`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.bookmarked);
        setCount((c) => c + (data.bookmarked ? 1 : -1));
      }
    } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-1 text-xs transition-colors ${bookmarked ? "text-[var(--accent)]" : "text-gray-400 hover:text-[var(--accent)]"}`}
      title={bookmarked ? "Remove bookmark" : "Bookmark this question"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {count > 0 && count}
    </button>
  );
}
