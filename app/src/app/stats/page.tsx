"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Analytics {
  summary: { totalBounties: number; activeBounties: number; awardedBounties: number; totalUsdcPaidOut: number };
  topSolvers: { userId: string; bountiesSolved: number; usdcEarned: number }[];
  byVerifier: { type: string; count: number; totalUsdc: number }[];
  recentPayouts: { bountyId: string; question: string; solver: string; usdcPaid: number; verifier: string; txHash: string; date: string }[];
  onChain: { escrowProgram: string; usdcMint: string; network: string; duneQuery?: string };
}

const VERIFIER_COLORS: Record<string, string> = {
  exact_number: "#00D4FF", numeric_tolerance: "#14F195", numeric_range: "#f48225",
  exact_string: "#a855f7", multi_numeric: "#FF6B6B", hash_preimage: "#f59e0b",
  sat: "#8b5cf6", graph_coloring: "#06b6d4", wasm_exec: "#14F195", zk_rust: "#9945FF",
};

export default function StatsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="max-w-4xl mx-auto py-20 text-center text-[var(--muted)]">Loading analytics...</div>
  );
  if (!data) return (
    <div className="max-w-4xl mx-auto py-20 text-center text-[var(--muted)]">Failed to load.</div>
  );

  const { summary, topSolvers, byVerifier, recentPayouts, onChain } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Platform Analytics</h1>
          <p className="text-sm text-[var(--muted)] mt-1">On-chain USDC bounty activity — fully transparent</p>
        </div>
        {onChain.duneQuery && (
          <a href={onChain.duneQuery} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[var(--blue)] no-underline hover:underline flex items-center gap-1">
            View on Dune ↗
          </a>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Bounties", value: summary.totalBounties },
          { label: "Active", value: summary.activeBounties, color: "var(--accent)" },
          { label: "Awarded", value: summary.awardedBounties, color: "var(--green)" },
          { label: "USDC Paid Out", value: `$${summary.totalUsdcPaidOut.toFixed(2)}`, color: "var(--green)" },
        ].map(s => (
          <div key={s.label} className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5 text-center">
            <div className="text-3xl font-bold tabular-nums" style={{ color: s.color || "var(--foreground)" }}>
              {s.value}
            </div>
            <div className="text-xs text-[var(--muted)] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* By verifier type */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Bounties by Verifier Type</h2>
        <div className="space-y-2">
          {byVerifier.map(v => {
            const maxCount = Math.max(...byVerifier.map(x => x.count));
            const pct = maxCount > 0 ? (v.count / maxCount) * 100 : 0;
            const color = VERIFIER_COLORS[v.type] ?? "var(--muted)";
            return (
              <div key={v.type} className="flex items-center gap-3">
                <div className="w-28 text-xs text-[var(--muted)] shrink-0 font-mono">{v.type}</div>
                <div className="flex-1 bg-[var(--border)] rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
                <div className="text-xs text-[var(--muted)] w-16 text-right tabular-nums">
                  {v.count}x · ${v.totalUsdc.toFixed(0)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent payouts */}
      {recentPayouts.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Recent Payouts</h2>
          <div className="space-y-2">
            {recentPayouts.map(p => (
              <div key={p.bountyId} className="flex items-center gap-3 text-sm py-2 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--green)] font-bold tabular-nums w-16 shrink-0">${p.usdcPaid.toFixed(2)}</span>
                <span className="text-[var(--muted)] flex-1 truncate">{p.question}</span>
                <span className="text-xs text-[var(--muted)] shrink-0 font-mono">{p.verifier}</span>
                {p.txHash && (
                  <a href={`https://solscan.io/tx/${p.txHash}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[var(--blue)] no-underline hover:underline shrink-0">tx↗</a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-chain info */}
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">On-Chain</h2>
        <div className="space-y-2 font-mono text-xs text-[var(--muted)]">
          <div className="flex gap-2"><span className="text-[var(--foreground)] w-28 shrink-0">Network</span>{onChain.network}</div>
          <div className="flex gap-2 flex-wrap"><span className="text-[var(--foreground)] w-28 shrink-0">Escrow Program</span>
            <a href={`https://solscan.io/account/${onChain.escrowProgram}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
              className="text-[var(--blue)] no-underline hover:underline break-all">{onChain.escrowProgram}</a>
          </div>
          <div className="flex gap-2 flex-wrap"><span className="text-[var(--foreground)] w-28 shrink-0">USDC Mint</span>
            <span className="break-all">{onChain.usdcMint}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-[var(--muted)]">
        <Link href="/bounties" className="no-underline hover:text-[var(--foreground)]">← Active Bounties</Link>
        <a href="/api/analytics" target="_blank" className="no-underline hover:text-[var(--foreground)]">Raw JSON ↗</a>
      </div>
    </div>
  );
}
