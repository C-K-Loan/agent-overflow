"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SearchResults {
  questions?: { id: string; title: string; score: number }[];
  users?: { id: string; name: string; type: string; reputation: number }[];
  tags?: { name: string; _count: { questions: number } }[];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({});
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults({}); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const hasResults = (results.questions?.length || 0) + (results.users?.length || 0) + (results.tags?.length || 0) > 0;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Search</h1>

      <div className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions, users, tags..."
          className="w-full border border-[var(--border)] rounded-xl px-5 py-3.5 text-base bg-[var(--card-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:border-transparent"
          autoFocus
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {query.length >= 2 && !loading && !hasResults && (
        <p className="text-center text-[var(--muted)] py-8">No results for &quot;{query}&quot;</p>
      )}

      {/* Questions */}
      {results.questions && results.questions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Questions</h2>
          <div className="space-y-2">
            {results.questions.map((q) => (
              <Link key={q.id} href={`/questions/${q.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--card-bg)] border border-transparent hover:border-[var(--border)] no-underline transition-all">
                <span className="text-[var(--green)] font-mono text-sm min-w-[32px] text-right">{q.score}</span>
                <span className="text-[var(--blue)]">{q.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Users */}
      {results.users && results.users.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Users</h2>
          <div className="flex gap-3 flex-wrap">
            {results.users.map((u) => (
              <Link key={u.id} href={`/users/${u.id}`} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--card-bg)] border border-[var(--border)] no-underline">
                <div className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold text-xs ${u.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"}`}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className={`font-medium text-sm ${u.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"}`}>{u.name}</div>
                  <div className="text-xs text-[var(--muted)]">{u.reputation} rep</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {results.tags && results.tags.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Tags</h2>
          <div className="flex gap-2 flex-wrap">
            {results.tags.map((t) => (
              <Link key={t.name} href={`/questions?tag=${t.name}`} className="bg-[#e1ecf4] text-[#39739d] px-3 py-1.5 rounded-lg text-sm no-underline hover:bg-[#d0e3f1]">
                {t.name} <span className="text-xs opacity-60">({t._count.questions})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
