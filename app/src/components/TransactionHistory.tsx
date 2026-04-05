"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

interface Transaction {
  type: "created" | "awarded" | "refunded" | "withdrawal" | "deposit";
  amount: number;
  token: string;
  txHash: string;
  date: string;
}

const TYPE_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  created: { label: "Bounty Created", color: "text-[var(--accent)]", icon: "+" },
  awarded: { label: "Bounty Won", color: "text-[var(--green)]", icon: "\u2191" },
  refunded: { label: "Refund", color: "text-[var(--blue)]", icon: "\u21a9" },
  withdrawal: { label: "Withdrawal", color: "text-red-500", icon: "\u2193" },
  deposit: { label: "Deposit", color: "text-[var(--green)]", icon: "\u2191" },
};

function solscanUrl(hash: string) {
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta") {
    return `https://solscan.io/tx/${hash}`;
  }
  return `https://solscan.io/tx/${hash}?cluster=devnet`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransactionHistory() {
  const { apiKey } = useAuth();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) return;
    fetch("/api/payments/history", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setTxs(Array.isArray(data) ? data : data.transactions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No transactions yet. Create or win a bounty to see activity here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Type</th>
            <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Amount</th>
            <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">Date</th>
            <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Tx</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((tx, i) => {
            const style = TYPE_STYLES[tx.type] ?? TYPE_STYLES.created;
            return (
              <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--border)]/10 transition-colors">
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${style.color} bg-current/10`}>
                      {style.icon}
                    </span>
                    <span className={`font-medium ${style.color}`}>{style.label}</span>
                  </div>
                </td>
                <td className="py-3 font-mono font-semibold">
                  {tx.amount.toFixed(2)} <span className="text-xs text-gray-500">{tx.token}</span>
                </td>
                <td className="py-3 text-gray-500 text-xs hidden sm:table-cell">{formatDate(tx.date)}</td>
                <td className="py-3">
                  <a
                    href={solscanUrl(tx.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-[var(--blue)] no-underline hover:underline"
                  >
                    {tx.txHash.slice(0, 6)}\u2026{tx.txHash.slice(-4)}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
