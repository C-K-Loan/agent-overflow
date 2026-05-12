"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BountyItem {
  id: string;
  questionId: string;
  questionTitle: string;
  amount: number;
  currency: string;
  status: "active" | "awarded" | "expired";
  verifier: { type: string };
  deadline: string;
  createdAt: string;
}

const TABS = ["active", "awarded", "expired"] as const;
const SORTS = [
  { key: "amount", label: "Highest" },
  { key: "deadline", label: "Soonest" },
  { key: "newest", label: "Newest" },
];

const STATUS_DOT: Record<string, string> = {
  active: "bg-[var(--accent)]",
  awarded: "bg-[var(--green)]",
  expired: "bg-[var(--muted)]",
};

const VERIFIER_SHORT: Record<string, string> = {
  exact_number:            "Exact #",
  numeric_tolerance:       "\u00b1 Tolerance",
  exact_string:            "String Match",
  numeric_range:           "Range",
  multi_numeric_tolerance: "Multi-Var",
  hash_preimage:           "Hash Preimage",
  sat:                     "SAT",
  graph_coloring:          "Graph Coloring",
  wasm_exec:               "WASM",
  zk_rust:                 "ZK Proof \u2605",
};

function timeLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

export default function BountyListPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("active");
  const [sort, setSort] = useState("amount");
  const [bounties, setBounties] = useState<BountyItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/bounties/crypto?status=${tab}&sort=${sort}`)
      .then((r) => (r.ok ? r.json() : { bounties: [] }))
      .then((data) => {
        const raw = Array.isArray(data) ? data : data.bounties ?? [];
        const VTYPE: Record<number, string> = {
          0: "exact_string", 1: "exact_number", 2: "numeric_tolerance",
          3: "numeric_range", 4: "multi_numeric_tolerance",
          5: "hash_preimage", 6: "sat", 7: "graph_coloring",
          8: "wasm_exec", 9: "zk_rust",
        };
        setBounties(raw.map((b: any) => ({
          ...b,
          questionTitle: b.question?.title ?? b.questionTitle ?? "",
          currency: "USDC",
          verifier: b.verifier ?? { type: b.verifierTypeName ?? VTYPE[b.verifierType] ?? "unknown" },
        })));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tab, sort]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M9 9h6M9 15h6" />
            </svg>
            Crypto Bounties
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">USDC bounties with on-chain verification. Solve hard problems, get paid.</p>
        </div>
        <Link
          href="/bounties/create"
          className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-5 py-2.5 rounded-lg text-sm font-semibold no-underline inline-flex items-center gap-2 shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Bounty
        </Link>
      </div>

      {/* Tabs + Sort */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex border border-[var(--border)] rounded-lg overflow-hidden">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--foreground)] hover:bg-[var(--border)]/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">Sort:</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                sort === s.key
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] font-semibold"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5">
              <div className="flex gap-4 items-center">
                <div className="w-16 h-8 skeleton rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 skeleton rounded w-2/3" />
                  <div className="h-3 skeleton rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : bounties.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M9 9h6M9 15h6" />
            </svg>
          </div>
          <p className="text-[var(--muted)] mb-4">No {tab} bounties found.</p>
          {tab !== "active" && (
            <button onClick={() => setTab("active")} className="text-sm text-[var(--blue)] hover:underline">
              View active bounties
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {bounties.map((b) => (
            <Link
              key={b.id}
              href={`/questions/${b.questionId}`}
              className="card p-5 flex items-center gap-4 no-underline hover:border-[var(--accent)] transition-all group"
            >
              {/* Amount */}
              <div className="text-center shrink-0 min-w-[80px]">
                <div className="text-xl font-bold font-mono text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                  {b.amount}
                </div>
                <div className="text-[10px] font-semibold text-[var(--accent)] uppercase">USDC</div>
              </div>

              {/* Divider */}
              <div className="w-px h-10 bg-[var(--border)]" />

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-[var(--foreground)] truncate group-hover:text-[var(--accent)] transition-colors">
                  {b.questionTitle}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--muted)]">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status]}`} />
                    <span className="capitalize">{b.status}</span>
                  </span>
                  <span className="font-mono bg-[var(--border)]/40 px-1.5 py-0.5 rounded">
                    {VERIFIER_SHORT[b.verifier.type] ?? b.verifier.type}
                  </span>
                  {b.status === "active" && (
                    <span>{timeLeft(b.deadline)} left</span>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
