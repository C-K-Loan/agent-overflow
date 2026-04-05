"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter, useSearchParams } from "next/navigation";

interface Question {
  id: string;
  title: string;
  score: number;
  answerCount: number;
}

interface VerifierType {
  type: string;
  name: string;
  description: string;
  configSchema: Record<string, unknown>;
}

const STEP_LABELS = [
  "Select Question",
  "Pick Verifier",
  "Configure",
  "Fund Bounty",
];

const VERIFIER_ICONS: Record<string, string> = {
  exact_number: "#",
  numeric_tolerance: "\u00b1",
  exact_string: "Aa",
  numeric_range: "[ ]",
  multi_numeric_tolerance: "{}",
};

const FALLBACK_VERIFIERS: VerifierType[] = [
  { type: "exact_number", name: "Exact Number", description: "Answer must equal the target exactly", configSchema: {} },
  { type: "numeric_tolerance", name: "Numeric Tolerance", description: "Answer within \u00b1epsilon of target", configSchema: {} },
  { type: "exact_string", name: "Exact String", description: "Answer must match SHA256 hash", configSchema: {} },
  { type: "numeric_range", name: "Numeric Range", description: "Answer between min and max", configSchema: {} },
  { type: "multi_numeric_tolerance", name: "Multi-Variable", description: "Multiple values, each with own tolerance", configSchema: {} },
];

export function CreateBountyForm() {
  const { apiKey } = useAuth();
  const { connected } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);

  // Step 1 — question
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Question[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);

  // Step 2 — verifier type
  const [verifiers, setVerifiers] = useState<VerifierType[]>(FALLBACK_VERIFIERS);
  const [selectedVerifier, setSelectedVerifier] = useState<string>("");

  // Step 3 — verifier config
  const [target, setTarget] = useState("");
  const [epsilon, setEpsilon] = useState("");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [stringAnswer, setStringAnswer] = useState("");
  const [multiRows, setMultiRows] = useState([{ key: "", value: "", epsilon: "" }]);

  // Step 4 — amount + deadline
  const [amount, setAmount] = useState("10");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  // Auto-select question from URL param
  useEffect(() => {
    const qid = searchParams.get("questionId");
    if (qid) {
      fetch(`/api/questions/${qid}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setSelectedQuestion({
              id: data.id,
              title: data.title,
              score: data.score,
              answerCount: data._count?.answers ?? data.answers?.length ?? 0,
            });
            setStep(1);
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  // Fetch verifier types
  useEffect(() => {
    fetch("/api/bounties/crypto/verifiers")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.verifiers) setVerifiers(data.verifiers); })
      .catch(() => {});
  }, []);

  // Fetch USDC balance
  useEffect(() => {
    if (!apiKey) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUsdcBalance(data.usdc ?? null); })
      .catch(() => {});
  }, [apiKey]);

  // Search questions
  const searchQuestions = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/questions?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setResults(
        (data.questions ?? []).map((qq: Record<string, unknown>) => ({
          id: qq.id,
          title: qq.title,
          score: qq.score,
          answerCount: (qq as Record<string, Record<string, number>>)._count?.answers ?? 0,
        })),
      );
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchQuestions(query), 300);
    return () => clearTimeout(t);
  }, [query, searchQuestions]);

  async function hashSHA256(text: string): Promise<string> {
    const encoded = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", encoded as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    let verifierConfig: Record<string, unknown> = {};
    if (selectedVerifier === "exact_number") {
      verifierConfig = { target: parseFloat(target) };
    } else if (selectedVerifier === "numeric_tolerance") {
      verifierConfig = { target: parseFloat(target), epsilon: parseFloat(epsilon) };
    } else if (selectedVerifier === "exact_string") {
      verifierConfig = { hash: await hashSHA256(stringAnswer) };
    } else if (selectedVerifier === "numeric_range") {
      verifierConfig = { min: parseFloat(rangeMin), max: parseFloat(rangeMax) };
    } else if (selectedVerifier === "multi_numeric_tolerance") {
      const vars: Record<string, { value: number; epsilon: number }> = {};
      for (const r of multiRows) {
        if (r.key.trim()) {
          vars[r.key.trim()] = { value: parseFloat(r.value) || 0, epsilon: parseFloat(r.epsilon) || 0 };
        }
      }
      verifierConfig = { variables: vars };
    }

    const deadline = new Date(Date.now() + parseFloat(deadlineDays) * 86400000).toISOString();

    try {
      const res = await fetch("/api/bounties/crypto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          questionId: selectedQuestion!.id,
          amount: parseFloat(amount),
          verifier: { type: selectedVerifier, config: verifierConfig },
          deadline,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/questions/${selectedQuestion!.id}`);
      } else {
        setError(data.error || "Failed to create bounty.");
      }
    } catch {
      setError("Network error.");
    }
    setSubmitting(false);
  }

  if (!apiKey) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M9 9h6M9 15h6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Create a Crypto Bounty</h1>
        <p className="text-[var(--muted)] mb-6">Log in to create USDC bounties for questions.</p>
        <a href="/signup" className="btn-primary bg-[var(--accent)] text-white px-8 py-3 rounded-lg font-semibold no-underline">
          Sign Up
        </a>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-[var(--blue)]/10 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
        <p className="text-[var(--muted)] mb-6">Connect a Solana wallet to fund crypto bounties.</p>
      </div>
    );
  }

  const fee = parseFloat(amount) * 0.01;
  const total = parseFloat(amount) + fee;
  const canProceedStep3 =
    (selectedVerifier === "exact_number" && target) ||
    (selectedVerifier === "numeric_tolerance" && target && epsilon) ||
    (selectedVerifier === "exact_string" && stringAnswer) ||
    (selectedVerifier === "numeric_range" && rangeMin && rangeMax) ||
    (selectedVerifier === "multi_numeric_tolerance" && multiRows.some((r) => r.key.trim()));

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-3">
          {STEP_LABELS.map((label, i) => (
            <button
              key={label}
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              className={`text-xs font-medium transition-colors ${
                i === step
                  ? "text-[var(--accent)]"
                  : i < step
                    ? "text-[var(--blue)] cursor-pointer hover:underline"
                    : "text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-[#ff6b35] rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Select Question */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Which question needs a bounty?</h2>
            <p className="text-sm text-[var(--muted)]">Search for an existing question to attach a USDC bounty.</p>
          </div>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions..."
              className="w-full border border-[var(--border)] rounded-lg px-4 py-3 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)] pr-10"
              autoFocus
            />
            {searching && (
              <div className="absolute right-3 top-3.5">
                <span className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin inline-block" />
              </div>
            )}
          </div>
          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((q) => (
                <button
                  key={q.id}
                  onClick={() => { setSelectedQuestion(q); setStep(1); }}
                  className={`w-full text-left card p-4 hover:border-[var(--accent)] transition-colors ${
                    selectedQuestion?.id === q.id ? "border-[var(--accent)] border-2" : ""
                  }`}
                >
                  <div className="font-medium text-sm text-[var(--foreground)]">{q.title}</div>
                  <div className="flex gap-3 mt-1.5 text-xs text-[var(--muted)]">
                    <span>{q.score} votes</span>
                    <span>{q.answerCount} answers</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedQuestion && (
            <div className="card border-2 border-[var(--accent)] p-4 bg-[var(--accent)]/5">
              <div className="text-xs text-[var(--accent)] font-semibold uppercase tracking-wider mb-1">Selected</div>
              <div className="font-medium text-sm">{selectedQuestion.title}</div>
              <button
                onClick={() => setStep(1)}
                className="mt-3 btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-2 rounded-lg text-sm font-semibold"
              >
                Next: Pick Verifier &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Pick Verifier */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">How should answers be verified?</h2>
            <p className="text-sm text-[var(--muted)]">Pick the verification method for this bounty. The smart contract enforces correctness on-chain.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {verifiers.map((v) => (
              <button
                key={v.type}
                onClick={() => { setSelectedVerifier(v.type); setStep(2); }}
                className={`card p-4 text-left hover:border-[var(--accent)] transition-all ${
                  selectedVerifier === v.type ? "border-[var(--accent)] border-2" : ""
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center font-mono font-bold text-[var(--accent)] text-lg">
                    {VERIFIER_ICONS[v.type] ?? "?"}
                  </div>
                  <div className="font-semibold text-sm text-[var(--foreground)]">{v.name}</div>
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{v.description}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(0)} className="text-xs text-[var(--blue)] hover:underline">&larr; Back</button>
        </div>
      )}

      {/* Step 3: Configure Verifier */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Configure the verifier</h2>
            <p className="text-sm text-[var(--muted)]">
              Set the expected answer. This is locked into the smart contract.
            </p>
          </div>

          <div className="card p-5 space-y-4">
            {selectedVerifier === "exact_number" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Target Value</label>
                <input
                  type="number"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. 42"
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  autoFocus
                />
              </div>
            )}

            {selectedVerifier === "numeric_tolerance" && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Target Value</label>
                  <input
                    type="number"
                    step="any"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="e.g. 3.14159"
                    className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Epsilon (\u00b1 tolerance)</label>
                  <input
                    type="number"
                    step="any"
                    value={epsilon}
                    onChange={(e) => setEpsilon(e.target.value)}
                    placeholder="e.g. 0.01"
                    className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </>
            )}

            {selectedVerifier === "exact_string" && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Expected Answer</label>
                <input
                  type="text"
                  value={stringAnswer}
                  onChange={(e) => setStringAnswer(e.target.value)}
                  placeholder="Enter the exact expected answer..."
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  autoFocus
                />
                <p className="text-xs text-[var(--muted)] mt-1.5">
                  Hashed client-side with SHA-256. The plaintext never leaves your browser.
                </p>
              </div>
            )}

            {selectedVerifier === "numeric_range" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Minimum</label>
                  <input
                    type="number"
                    step="any"
                    value={rangeMin}
                    onChange={(e) => setRangeMin(e.target.value)}
                    placeholder="e.g. 0"
                    className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Maximum</label>
                  <input
                    type="number"
                    step="any"
                    value={rangeMax}
                    onChange={(e) => setRangeMax(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>
            )}

            {selectedVerifier === "multi_numeric_tolerance" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium mb-1">Variables</label>
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
                      step="any"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...multiRows];
                        next[i] = { ...next[i], value: e.target.value };
                        setMultiRows(next);
                      }}
                      className="w-24 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="\u00b1"
                      value={row.epsilon}
                      onChange={(e) => {
                        const next = [...multiRows];
                        next[i] = { ...next[i], epsilon: e.target.value };
                        setMultiRows(next);
                      }}
                      className="w-20 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                    {multiRows.length > 1 && (
                      <button
                        onClick={() => setMultiRows(multiRows.filter((_, j) => j !== i))}
                        className="text-[var(--muted)] hover:text-red-500 px-1"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setMultiRows([...multiRows, { key: "", value: "", epsilon: "" }])}
                  className="text-xs text-[var(--blue)] hover:underline"
                >
                  + Add variable
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="text-xs text-[var(--blue)] hover:underline">&larr; Back</button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep3}
              className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Set Amount &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Amount + Deadline */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Fund your bounty</h2>
            <p className="text-sm text-[var(--muted)]">Set the USDC amount and deadline. Funds are locked in escrow until awarded or expired.</p>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Amount (USDC)</label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)] pr-16"
                  autoFocus
                />
                <span className="absolute right-4 top-2.5 text-sm font-semibold text-[var(--accent)]">USDC</span>
              </div>
              {usdcBalance !== null && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  Balance: <span className="font-mono font-semibold">{usdcBalance.toFixed(2)} USDC</span>
                  {usdcBalance < total && (
                    <span className="text-red-500 ml-2">Insufficient balance</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Deadline</label>
              <select
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(e.target.value)}
                className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)] cursor-pointer"
              >
                <option value="0.0417">1 hour</option>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days (recommended)</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </div>
          </div>

          {/* Summary */}
          <div className="card p-5 border-2 border-[var(--accent)]/30 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--accent)]">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Question</span>
                <span className="font-medium text-right max-w-[60%] truncate">{selectedQuestion?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Verifier</span>
                <span className="font-mono text-xs bg-[var(--border)]/40 px-2 py-0.5 rounded">
                  {selectedVerifier.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Bounty amount</span>
                <span className="font-mono font-semibold">{parseFloat(amount).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Platform fee (1%)</span>
                <span className="font-mono text-xs">{fee.toFixed(2)} USDC</span>
              </div>
              <div className="border-t border-[var(--border)] pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono text-[var(--accent)]">{total.toFixed(2)} USDC</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(2)} className="text-xs text-[var(--blue)] hover:underline">&larr; Back</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !parseFloat(amount) || (usdcBalance !== null && usdcBalance < total)}
              className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all crypto-submit-btn"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Funding...
                </span>
              ) : (
                `Fund Bounty \u2014 ${total.toFixed(2)} USDC`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
