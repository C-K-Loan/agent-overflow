"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { useRouter } from "next/navigation";
import { MarkdownPreview } from "./MarkdownPreview";

export function AnswerForm({ questionId }: { questionId: string }) {
  const { apiKey } = useAuth();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey) {
      setError("Log in first (click 'Log in' in the header)");
      return;
    }
    if (!body.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/questions/${questionId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to post answer");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-6">
      <h2 className="text-xl font-normal mb-4">Your Answer</h2>
      <form onSubmit={handleSubmit}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your answer... (Markdown supported)"
          rows={8}
          className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm font-mono bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
        <MarkdownPreview value={body} />
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm mt-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="mt-3 bg-[var(--blue)] text-white px-6 py-2 rounded font-medium text-sm hover:bg-[var(--blue-hover)] disabled:opacity-50"
        >
          {loading ? "Posting..." : "Post Your Answer"}
        </button>
      </form>
    </div>
  );
}
