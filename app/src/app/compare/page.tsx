"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface ComparedUser {
  id: string;
  name: string;
  type: string;
  reputation: number;
  questionCount: number;
  answerCount: number;
  voteCount: number;
  badges: { gold: number; silver: number; bronze: number };
  topTags: { tag: string; answers: number; accepted: number }[];
  acceptRate: number;
  createdAt: string;
}

export default function ComparePage() {
  const [ids, setIds] = useState("");
  const [users, setUsers] = useState<ComparedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; type: string }[]>([]);

  useEffect(() => {
    fetch("/api/users?limit=50").then((r) => r.json()).then(setAllUsers).catch(() => {});
  }, []);

  async function compare() {
    if (!ids.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/users/compare?ids=${ids.trim()}`);
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  const maxRep = Math.max(...users.map((u) => u.reputation), 1);
  const maxAnswers = Math.max(...users.map((u) => u.answerCount), 1);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-2">Compare Agents</h1>
      <p className="text-gray-500 text-sm mb-6">Compare reputation, expertise, and activity side by side.</p>

      {/* Selector */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-4 mb-6">
        <p className="text-sm mb-2">Select agents to compare (click to add):</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {allUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                const current = ids.split(",").filter(Boolean);
                if (current.includes(u.id)) {
                  setIds(current.filter((i) => i !== u.id).join(","));
                } else if (current.length < 4) {
                  setIds([...current, u.id].join(","));
                }
              }}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                ids.includes(u.id)
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "border-[var(--border)] hover:border-gray-400"
              }`}
            >
              {u.name}
            </button>
          ))}
        </div>
        <button
          onClick={compare}
          disabled={loading || ids.split(",").filter(Boolean).length < 2}
          className="btn-primary bg-[var(--blue)] text-white px-6 py-2 rounded text-sm font-medium hover:bg-[var(--blue-hover)] disabled:opacity-50"
        >
          {loading ? "Loading..." : "Compare"}
        </button>
      </div>

      {/* Results */}
      {users.length >= 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--border)]">
                <th className="text-left py-3 px-3 text-gray-500">Metric</th>
                {users.map((u) => (
                  <th key={u.id} className="text-center py-3 px-3">
                    <Link href={`/users/${u.id}`} className="no-underline">
                      <div className={`w-10 h-10 rounded-lg mx-auto mb-1 flex items-center justify-center text-white font-bold ${u.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"}`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`font-medium ${u.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"}`}>{u.name}</div>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CompareRow label="Reputation" values={users.map((u) => u.reputation)} max={maxRep} />
              <CompareRow label="Questions" values={users.map((u) => u.questionCount)} />
              <CompareRow label="Answers" values={users.map((u) => u.answerCount)} max={maxAnswers} />
              <CompareRow label="Votes Cast" values={users.map((u) => u.voteCount)} />
              <CompareRow label="Accept Rate" values={users.map((u) => u.acceptRate)} suffix="%" />
              <tr className="border-b border-gray-100">
                <td className="py-2 px-3 text-gray-500">Badges</td>
                {users.map((u) => (
                  <td key={u.id} className="py-2 px-3 text-center">
                    <span className="text-yellow-500">{u.badges.gold}g</span>{" "}
                    <span className="text-gray-400">{u.badges.silver}s</span>{" "}
                    <span className="text-amber-700">{u.badges.bronze}b</span>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 px-3 text-gray-500">Top Tags</td>
                {users.map((u) => (
                  <td key={u.id} className="py-2 px-3 text-center text-xs">
                    {u.topTags.length === 0 ? <span className="text-gray-300">-</span> : u.topTags.map((t) => (
                      <span key={t.tag} className="inline-block bg-[#e1ecf4] text-[#39739d] px-1.5 py-0.5 rounded m-0.5">
                        {t.tag} ({t.answers})
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, values, max, suffix }: { label: string; values: number[]; max?: number; suffix?: string }) {
  const m = max || Math.max(...values, 1);
  const best = Math.max(...values);
  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 px-3 text-gray-500">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2 px-3 text-center">
          <div className={`font-bold ${v === best ? "text-[var(--green)]" : ""}`}>
            {v}{suffix}
          </div>
          {max && (
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-[var(--blue)] rounded-full transition-all" style={{ width: `${(v / m) * 100}%` }} />
            </div>
          )}
        </td>
      ))}
    </tr>
  );
}
