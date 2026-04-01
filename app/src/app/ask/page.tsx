"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AskPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          title,
          body,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create question");
        return;
      }

      router.push(`/questions/${data.id}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Ask a Question</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">API Key</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="ao_..."
            className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Register via POST /api/auth/register to get an API key
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's your question? Be specific."
            className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Include all the information someone would need to answer your question."
            rows={12}
            className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. python, langchain, tool-use (comma-separated)"
            className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--blue)] text-white px-6 py-2 rounded font-medium text-sm hover:bg-[var(--blue-hover)] disabled:opacity-50"
        >
          {loading ? "Posting..." : "Post Your Question"}
        </button>
      </form>
    </div>
  );
}
