"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

interface VerifierConfig {
  type: string;
  config: Record<string, unknown>;
}

interface MultiRow {
  key: string;
  value: string;
}

export function SubmitSolution({
  bountyId,
  verifier,
  amount,
  onClose,
  onAwarded,
}: {
  bountyId: string;
  verifier: VerifierConfig;
  amount: number;
  onClose: () => void;
  onAwarded: () => void;
}) {
  const { apiKey } = useAuth();

  const [singleValue, setSingleValue] = useState("");
  const [multiRows, setMultiRows] = useState<MultiRow[]>([{ key: "", value: "" }]);
  const [simResult, setSimResult] = useState<"idle" | "loading" | "pass" | "fail">("idle");
  const [simMessage, setSimMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string; txHash?: string } | null>(null);

  function buildSolution(): unknown {
    if (verifier.type === "multi_numeric_tolerance") {
      const obj: Record<string, number> = {};
      for (const r of multiRows) {
        if (r.key.trim()) obj[r.key.trim()] = parseFloat(r.value) || 0;
      }
      return obj;
    }
    if (verifier.type === "exact_string") {
      return singleValue;
    }
    return parseFloat(singleValue) || 0;
  }

  async function simulate() {
    setSimResult("loading");
    setSimMessage("");
    try {
      const res = await fetch(`/api/bounties/crypto/${bountyId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ solution: buildSolution(), simulate: true }),
      });
      const data = await res.json();
      if (res.ok && data.passed) {
        setSimResult("pass");
        setSimMessage("Simulation passed \u2014 your answer is correct!");
      } else {
        setSimResult("fail");
        setSimMessage(data.error || data.message || "Incorrect answer.");
      }
    } catch {
      setSimResult("fail");
      setSimMessage("Network error. Try again.");
    }
  }

  async function submitAndClaim() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await fetch(`/api/bounties/crypto/${bountyId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ solution: buildSolution() }),
      });
      const data = await res.json();
      if (res.ok && data.awarded) {
        setSubmitResult({
          ok: true,
          message: `Bounty awarded! ${amount} USDC sent to your wallet.`,
          txHash: data.txHash,
        });
        setTimeout(onAwarded, 2000);
      } else {
        setSubmitResult({
          ok: false,
          message: data.error || "Someone beat you to it.",
        });
      }
    } catch {
      setSubmitResult({ ok: false, message: "Network error." });
    }
    setSubmitting(false);
  }

  const isMulti = verifier.type === "multi_numeric_tolerance";
  const isString = verifier.type === "exact_string";

  const solscanUrl = submitResult?.txHash
    ? process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta"
      ? `https://solscan.io/tx/${submitResult.txHash}`
      : `https://solscan.io/tx/${submitResult.txHash}?cluster=devnet`
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-xl max-w-md w-full crypto-modal-enter">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">Submit Solution</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Bounty: {amount} USDC &middot; Verifier: {verifier.type.replace(/_/g, " ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl leading-none p-1 transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Input fields */}
          {isMulti ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--foreground)]">
                Solution Values
              </label>
              {multiRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) => {
                      const next = [...multiRows];
                      next[i] = { ...next[i], key: e.target.value };
                      setMultiRows(next);
                    }}
                    className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <input
                    type="number"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => {
                      const next = [...multiRows];
                      next[i] = { ...next[i], value: e.target.value };
                      setMultiRows(next);
                    }}
                    className="w-28 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  {multiRows.length > 1 && (
                    <button
                      onClick={() => setMultiRows(multiRows.filter((_, j) => j !== i))}
                      className="text-[var(--muted)] hover:text-red-500 px-1 transition-colors"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setMultiRows([...multiRows, { key: "", value: "" }])}
                className="text-xs text-[var(--blue)] hover:underline"
              >
                + Add row
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                {isString ? "Your Answer" : "Numeric Answer"}
              </label>
              <input
                type={isString ? "text" : "number"}
                step="any"
                value={singleValue}
                onChange={(e) => setSingleValue(e.target.value)}
                placeholder={isString ? "Enter your answer..." : "e.g. 42.0"}
                className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                autoFocus
              />
            </div>
          )}

          {/* Simulation result */}
          {simResult === "pass" && (
            <div className="bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-lg px-4 py-3 flex items-start gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" className="shrink-0 mt-0.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-sm text-[var(--green)] font-medium">{simMessage}</span>
            </div>
          )}
          {simResult === "fail" && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-start gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="text-sm text-red-500 font-medium">{simMessage}</span>
            </div>
          )}

          {/* Submit result */}
          {submitResult && (
            <div className={`rounded-lg px-4 py-3 ${submitResult.ok ? "bg-[var(--green)]/10 border border-[var(--green)]/30" : "bg-red-500/10 border border-red-500/30"}`}>
              <p className={`text-sm font-semibold ${submitResult.ok ? "text-[var(--green)]" : "text-red-500"}`}>
                {submitResult.message}
              </p>
              {solscanUrl && (
                <a
                  href={solscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-[var(--blue)] mt-1.5 no-underline hover:underline"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  View on Solscan
                </a>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={simulate}
              disabled={simResult === "loading" || !!submitResult?.ok}
              className="flex-1 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {simResult === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Simulating...
                </span>
              ) : (
                "Simulate"
              )}
            </button>
            <button
              onClick={submitAndClaim}
              disabled={simResult !== "pass" || submitting || !!submitResult?.ok}
              className="flex-1 btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Claiming...
                </span>
              ) : (
                "Submit & Claim Bounty"
              )}
            </button>
          </div>

          {simResult !== "pass" && !submitResult && (
            <p className="text-[10px] text-[var(--muted)] text-center">
              Simulate first to verify your answer (free, no on-chain tx). Then claim to receive {amount} USDC.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
