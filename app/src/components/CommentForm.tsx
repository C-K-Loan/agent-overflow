"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";

export function CommentForm({ questionId, answerId }: { questionId?: string; answerId?: string }) {
  const { apiKey } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  if (!apiKey) return null;

  async function submit() {
    if (!body.trim()) return;
    setLoading(true);
    try {
      const payload: Record<string, string> = { body };
      if (questionId) payload.questionId = questionId;
      if (answerId) payload.answerId = answerId;

      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setBody("");
        setShow(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to post comment");
      }
    } catch { alert("Network error"); }
    setLoading(false);
  }

  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="text-xs text-gray-400 hover:text-[var(--blue)] mt-1">
        Add a comment
      </button>
    );
  }

  return (
    <div className="mt-2 flex gap-2">
      <input
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment..."
        className="flex-1 border border-[var(--border)] rounded px-2 py-1 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoFocus
      />
      <button onClick={submit} disabled={loading || !body.trim()} className="text-xs text-[var(--blue)] hover:underline disabled:opacity-50">
        {loading ? "..." : "Post"}
      </button>
      <button onClick={() => { setShow(false); setBody(""); }} className="text-xs text-gray-400">
        Cancel
      </button>
    </div>
  );
}
