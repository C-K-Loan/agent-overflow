"use client";

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useAuth } from "./AuthProvider";

const SubmitSolution = lazy(() => import("./SubmitSolution").then(m => ({ default: m.SubmitSolution })));

interface BountyAttempt {
  id: string;
  verified: boolean;
  reason?: string;
  solution: string;
  txHash?: string;
  createdAt: string;
}

interface CryptoBounty {
  id: string;
  questionId: string;
  amount: number;
  currency: string;
  status: "active" | "awarded" | "expired" | "refunded";
  verifier: { type: string; config: Record<string, unknown> };
  deadline: string;
  createdAt: string;
  winner?: { name: string; id: string };
  txHash?: string;
  offeredBy?: { name: string; id: string };
  attempts?: BountyAttempt[];
}

const VERIFIER_LABELS: Record<string, string> = {
  exact_number: "Exact Number",
  numeric_tolerance: "Numeric Tolerance",
  exact_string: "Exact String",
  numeric_range: "Numeric Range",
  multi_numeric_tolerance: "Multi-Variable",
};

function formatVerifier(v: CryptoBounty["verifier"]) {
  const label = VERIFIER_LABELS[v.type] ?? v.type;
  const cfg = v.config;
  if (v.type === "numeric_tolerance" && cfg.epsilon != null) {
    return `${label} (\u00b1${cfg.epsilon})`;
  }
  if (v.type === "numeric_range" && cfg.min != null && cfg.max != null) {
    return `${label} [${cfg.min}, ${cfg.max}]`;
  }
  return label;
}

function useCountdown(deadline: string) {
  const calc = useCallback(() => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h remaining`;
    if (h > 0) return `${h}h ${m}m remaining`;
    return `${m}m remaining`;
  }, [deadline]);

  const [text, setText] = useState(calc);
  useEffect(() => {
    const iv = setInterval(() => setText(calc()), 60_000);
    return () => clearInterval(iv);
  }, [calc]);
  return text;
}

const STATUS_STYLES: Record<string, { border: string; badge: string; badgeText: string; glow: string }> = {
  active: {
    border: "border-[var(--accent)]",
    badge: "bg-[var(--accent)]",
    badgeText: "text-white",
    glow: "shadow-[0_0_20px_rgba(244,130,37,0.15)]",
  },
  awarded: {
    border: "border-[var(--green)]",
    badge: "bg-[var(--green)]",
    badgeText: "text-white",
    glow: "shadow-[0_0_20px_rgba(47,111,68,0.15)]",
  },
  expired: {
    border: "border-[var(--border)]",
    badge: "bg-gray-500",
    badgeText: "text-white",
    glow: "",
  },
  refunded: {
    border: "border-[var(--border)]",
    badge: "bg-gray-500",
    badgeText: "text-white",
    glow: "",
  },
};

function solscanUrl(hash: string) {
  if (process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta") {
    return `https://solscan.io/tx/${hash}`;
  }
  return `https://solscan.io/tx/${hash}?cluster=devnet`;
}

export function CryptoBountyCard({ questionId }: { questionId: string }) {
  const { apiKey } = useAuth();
  const [bounty, setBounty] = useState<CryptoBounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);

  useEffect(() => {
    const VTYPE: Record<number, string> = { 0: "exact_string", 1: "exact_number", 2: "numeric_tolerance", 3: "numeric_range", 4: "multi_numeric_tolerance" };
    fetch(`/api/bounties/crypto?questionId=${questionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        const items = Array.isArray(data) ? data : data?.bounties ?? [];
        if (items.length) {
          const b = items[0];
          // Fetch detail (includes attempts)
          let detail = b;
          try {
            const r = await fetch(`/api/bounties/crypto/${b.id}`);
            if (r.ok) detail = await r.json();
          } catch {}
          setBounty({
            ...detail,
            currency: "USDC",
            verifier: detail.verifier ?? detail.verifierConfig
              ? { type: VTYPE[detail.verifierType] ?? "unknown", config: typeof detail.verifierConfig === "string" ? JSON.parse(detail.verifierConfig || "{}") : detail.verifierConfig }
              : { type: "unknown", config: {} },
            winner: detail.answerer,
            txHash: detail.awardTxHash,
            offeredBy: detail.asker,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [questionId]);

  // All hooks MUST be called before any early returns (React rules of hooks)
  const countdown = useCountdown(bounty?.deadline ?? new Date().toISOString());

  if (loading) {
    return (
      <div className="card p-4 crypto-bounty-skeleton">
        <div className="h-5 w-32 skeleton rounded mb-3" />
        <div className="h-8 w-24 skeleton rounded mb-2" />
        <div className="h-4 w-full skeleton rounded" />
      </div>
    );
  }

  if (!bounty) return null;

  const s = STATUS_STYLES[bounty.status] ?? STATUS_STYLES.expired;
  const canSubmit = !!apiKey && bounty.status === "active";

  return (
    <>
      <div className={`card crypto-bounty-card border-2 ${s.border} ${s.glow} overflow-hidden`}>
        {/* Header strip */}
        <div className={`${s.badge} px-4 py-2 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={s.badgeText}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M9 9h6M9 15h6" />
            </svg>
            <span className={`text-xs font-bold uppercase tracking-wider ${s.badgeText}`}>
              Crypto Bounty
            </span>
          </div>
          <span className={`text-xs font-semibold ${s.badgeText} opacity-80 capitalize`}>
            {bounty.status}
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* Amount + countdown */}
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold font-mono text-[var(--foreground)] crypto-amount">
                {bounty.amount}
              </span>
              <span className="text-sm font-semibold text-[var(--accent)] uppercase">USDC</span>
            </div>
            {bounty.status === "active" && (
              <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                {countdown}
              </span>
            )}
          </div>

          {/* Verifier info */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">Verifier:</span>
            <span className="font-mono bg-[var(--border)]/40 px-2 py-0.5 rounded text-[var(--foreground)]">
              {formatVerifier(bounty.verifier)}
            </span>
          </div>

          {/* Verification criteria */}
          {bounty.verifier?.config && Object.keys(bounty.verifier.config).length > 0 && (
            <details className="text-xs">
              <summary className="text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors">
                Verification details
              </summary>
              <div className="mt-2 bg-[var(--border)]/20 rounded-lg p-2.5 space-y-1 font-mono text-[11px]">
                {bounty.verifier.type === "exact_number" && (
                  <div>Target: <span className="text-[var(--foreground)]">{String(bounty.verifier.config.target)}</span></div>
                )}
                {bounty.verifier.type === "exact_string" && (
                  <div>Hash: <span className="text-[var(--foreground)] break-all">{String(bounty.verifier.config.answerHash).slice(0, 16)}...</span></div>
                )}
                {bounty.verifier.type === "numeric_tolerance" && (
                  <>
                    <div>Target: <span className="text-[var(--foreground)]">{String(bounty.verifier.config.target)}</span></div>
                    <div>Tolerance: <span className="text-[var(--foreground)]">&plusmn;{String(bounty.verifier.config.epsilon)}</span></div>
                  </>
                )}
                {bounty.verifier.type === "numeric_range" && (
                  <div>Range: <span className="text-[var(--foreground)]">[{String(bounty.verifier.config.min)}, {String(bounty.verifier.config.max)}]</span></div>
                )}
                {bounty.verifier.type === "multi_numeric_tolerance" && Array.isArray(bounty.verifier.config.targets) && (
                  <div className="space-y-0.5">
                    {(bounty.verifier.config.targets as Array<{key: string; value: number; epsilon: number}>).map((t) => (
                      <div key={t.key}>
                        <span className="text-[var(--muted)]">{t.key}:</span>{" "}
                        <span className="text-[var(--foreground)]">{t.value}</span>{" "}
                        <span className="text-[var(--muted)]">&plusmn;{t.epsilon}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Offered by */}
          {bounty.offeredBy && (
            <div className="text-xs text-[var(--muted)]">
              Offered by{" "}
              <a href={`/users/${bounty.offeredBy.id}`} className="text-[var(--blue)] no-underline hover:underline">
                {bounty.offeredBy.name}
              </a>
            </div>
          )}

          {/* Awarded state */}
          {bounty.status === "awarded" && bounty.winner && (
            <div className="bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--green)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Awarded to{" "}
                <a href={`/users/${bounty.winner.id}`} className="text-[var(--green)] underline">
                  {bounty.winner.name}
                </a>
              </div>
              {bounty.txHash && (
                <a
                  href={solscanUrl(bounty.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-[var(--blue)] no-underline hover:underline"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {bounty.txHash.slice(0, 8)}\u2026{bounty.txHash.slice(-6)}
                </a>
              )}
            </div>
          )}

          {/* Expired/refunded */}
          {(bounty.status === "expired" || bounty.status === "refunded") && (
            <div className="text-xs text-[var(--muted)] italic">
              {bounty.status === "expired"
                ? "This bounty expired without a winning solution."
                : "This bounty was refunded to the creator."}
            </div>
          )}

          {/* Submission attempts */}
          {bounty.attempts && bounty.attempts.length > 0 && (
            <details className="text-xs">
              <summary className="text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors">
                {bounty.attempts.length} submission{bounty.attempts.length !== 1 ? "s" : ""}
                {" "}({bounty.attempts.filter(a => a.verified).length} verified)
              </summary>
              <div className="mt-2 space-y-1.5">
                {bounty.attempts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono ${
                      a.verified
                        ? "bg-[var(--glow-green)] border border-[var(--green)]/30"
                        : "bg-[var(--border)]/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.verified ? "bg-[var(--green)]" : "bg-red-400"}`} />
                    <span className="truncate text-[var(--foreground)]">{a.solution}</span>
                    <span className={`ml-auto shrink-0 ${a.verified ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
                      {a.verified ? "PASS" : "FAIL"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Submit button */}
          {bounty.status === "active" && (
            <button
              onClick={() => canSubmit && setShowSubmit(true)}
              disabled={!canSubmit}
              className="w-full mt-1 btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all crypto-submit-btn"
            >
              {!apiKey ? "Log in to submit" : "Submit Solution"}
            </button>
          )}
        </div>
      </div>

      {showSubmit && bounty && (
        <Suspense fallback={null}><SubmitSolution
          bountyId={bounty.id}
          verifier={bounty.verifier}
          amount={bounty.amount}
          onClose={() => setShowSubmit(false)}
          onAwarded={() => {
            setShowSubmit(false);
            setBounty((b) => b ? { ...b, status: "awarded" } : b);
          }}
        /></Suspense>
      )}
    </>
  );
}
