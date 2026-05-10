"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TransactionHistory } from "@/components/TransactionHistory";
import { LiFiDepositWidget } from "@/components/LiFiDepositWidget";
import Link from "next/link";

export default function WalletDashboard() {
  const { apiKey } = useAuth();
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [noWallet, setNoWallet] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [copied, setCopied] = useState(false);

  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<{ ok: boolean; message: string } | null>(null);

  // SOL balance — needs connected Solana wallet
  useEffect(() => {
    if (!publicKey) { setSolBalance(null); return; }
    connection.getBalance(publicKey).then((l) => setSolBalance(l / LAMPORTS_PER_SOL)).catch(() => {});
  }, [publicKey, connection]);

  // USDC balance + platform deposit address — only needs API key
  useEffect(() => {
    if (!apiKey) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUsdcBalance(data.usdc ?? 0); })
      .catch(() => {});

    fetch("/api/wallet/deposit", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => {
        if (r.status === 404) { setNoWallet(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((data) => { if (data?.address) setDepositAddress(data.address); })
      .catch(() => {});
  }, [apiKey]);

  async function createWallet() {
    setCreatingWallet(true);
    try {
      const res = await fetch("/api/wallet/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      if (res.ok && data.publicKey) {
        setDepositAddress(data.publicKey);
        setNoWallet(false);
      }
    } catch {}
    setCreatingWallet(false);
  }

  function copyAddress() {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawing(true);
    setWithdrawResult(null);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ destination: withdrawDest, amount: parseFloat(withdrawAmount), token: "USDC" }),
      });
      const data = await res.json();
      if (res.ok) {
        setWithdrawResult({ ok: true, message: `Withdrawal of ${withdrawAmount} USDC initiated.` });
        setWithdrawDest("");
        setWithdrawAmount("");
      } else {
        setWithdrawResult({ ok: false, message: data.error || "Withdrawal failed." });
      }
    } catch {
      setWithdrawResult({ ok: false, message: "Network error." });
    }
    setWithdrawing(false);
  }

  // Not logged in at all
  if (!apiKey) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <h1 className="text-2xl font-bold mb-2">Wallet Dashboard</h1>
        <p className="text-[var(--muted)] mb-6">Log in to manage your wallet.</p>
        <Link href="/signup" className="btn-primary bg-[var(--accent)] text-white px-8 py-3 rounded-lg font-semibold no-underline">
          Sign Up
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
        Wallet Dashboard
      </h1>

      {/* ── Always visible once logged in ── */}

      {/* Platform deposit address */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
            <polyline points="7 13 12 18 17 13" />
            <line x1="12" y1="2" x2="12" y2="18" />
            <line x1="3" y1="22" x2="21" y2="22" />
          </svg>
          Deposit USDC
        </h2>
        <p className="text-xs text-[var(--muted)] mb-3">
          Send USDC to this address on Solana {process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet" : "devnet"}.
        </p>
        {depositAddress ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--code-bg)] text-[var(--foreground)] px-4 py-2.5 rounded-lg text-sm font-mono truncate">
              {depositAddress}
            </code>
            <button onClick={copyAddress} className="shrink-0 border border-[var(--border)] hover:border-[var(--blue)] px-3 py-2.5 rounded-lg text-xs font-medium transition-colors">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : noWallet ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--muted)]">No platform wallet found. Create one to get a deposit address.</p>
            <button onClick={createWallet} disabled={creatingWallet}
              className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {creatingWallet ? "Creating..." : "Create Platform Wallet"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading deposit address...</p>
        )}
      </div>

      {/* LI.FI bridge — no Solana wallet required */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Bridge from Another Chain
        </h2>
        <p className="text-xs text-[var(--muted)] mb-3">
          Have USDC on Ethereum, Base, Arbitrum, or 60+ other chains? Bridge directly to your Solana wallet.
        </p>
        {process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "mainnet-beta" && (
          <div className="rounded-lg border px-3 py-2 text-xs mb-4" style={{ borderColor: "#F4822540", background: "#F4822508", color: "#F48225" }}>
            ⚠️ Cross-chain bridging requires mainnet. Widget shown for preview — live bridging available at launch.
          </div>
        )}
        {depositAddress
          ? <LiFiDepositWidget walletAddress={depositAddress} />
          : noWallet
          ? <p className="text-sm text-[var(--muted)]">Create a platform wallet above to use the bridge.</p>
          : <p className="text-sm text-[var(--muted)]">Loading wallet address...</p>
        }
      </div>

      {/* ── Requires connected Solana wallet ── */}

      {!connected ? (
        <div className="card p-5 text-center space-y-3">
          <p className="text-sm text-[var(--muted)]">Connect a Solana wallet to view balances and withdraw.</p>
          <button
            onClick={() => setVisible(true)}
            className="btn-primary bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white px-6 py-2.5 rounded-lg text-sm font-semibold"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {/* Balances */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium mb-2">SOL Balance</div>
              <div className="text-3xl font-bold font-mono text-[var(--foreground)]">
                {solBalance !== null ? solBalance.toFixed(4) : "—"}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">Solana native token</div>
            </div>
            <div className="card p-5 border-2 border-[var(--accent)]/20">
              <div className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium mb-2">USDC Balance</div>
              <div className="text-3xl font-bold font-mono text-[var(--accent)]">
                {usdcBalance !== null ? usdcBalance.toFixed(2) : "—"}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">Platform escrow balance</div>
            </div>
          </div>

          {/* Withdraw */}
          <div className="card p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <polyline points="7 11 12 6 17 11" />
                <line x1="12" y1="6" x2="12" y2="22" />
                <line x1="3" y1="2" x2="21" y2="2" />
              </svg>
              Withdraw USDC
            </h2>
            <form onSubmit={handleWithdraw} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Destination Address</label>
                <input type="text" value={withdrawDest} onChange={(e) => setWithdrawDest(e.target.value)}
                  placeholder="Solana address..."
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  required />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Amount (USDC)</label>
                <input type="number" min="0.01" step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  required />
              </div>
              {withdrawResult && (
                <div className={`rounded-lg px-4 py-2.5 text-sm ${withdrawResult.ok ? "bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/30" : "bg-red-500/10 text-red-500 border border-red-500/30"}`}>
                  {withdrawResult.message}
                </div>
              )}
              <button type="submit" disabled={withdrawing || !withdrawDest || !withdrawAmount}
                className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {withdrawing ? "Withdrawing..." : "Withdraw"}
              </button>
            </form>
          </div>

          {/* Transaction History */}
          <div className="card p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Transaction History
            </h2>
            <TransactionHistory />
          </div>
        </>
      )}
    </div>
  );
}
