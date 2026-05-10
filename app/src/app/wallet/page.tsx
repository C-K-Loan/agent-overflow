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
  const [copied, setCopied] = useState(false);

  const [withdrawDest, setWithdrawDest] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Fetch SOL balance from wallet
  useEffect(() => {
    if (!publicKey) { setSolBalance(null); return; }
    connection.getBalance(publicKey).then((l) => setSolBalance(l / LAMPORTS_PER_SOL)).catch(() => {});
  }, [publicKey, connection]);

  // Fetch USDC balance + deposit address from API
  useEffect(() => {
    if (!apiKey) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUsdcBalance(data.usdc ?? 0); })
      .catch(() => {});

    fetch("/api/wallet/deposit", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.address) setDepositAddress(data.address); })
      .catch(() => {});
  }, [apiKey]);

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

  if (!connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-[var(--blue)]/10 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.5">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Connect Your Wallet</h1>
        <p className="text-[var(--muted)] mb-6">Connect a Solana wallet to view your dashboard.</p>
        <button
          onClick={() => setVisible(true)}
          className="btn-primary bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white px-8 py-3 rounded-lg font-semibold"
        >
          Connect Wallet
        </button>
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

      {/* Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium mb-2">SOL Balance</div>
          <div className="text-3xl font-bold font-mono text-[var(--foreground)]">
            {solBalance !== null ? solBalance.toFixed(4) : "\u2014"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">Solana native token</div>
        </div>
        <div className="card p-5 border-2 border-[var(--accent)]/20">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider font-medium mb-2">USDC Balance</div>
          <div className="text-3xl font-bold font-mono text-[var(--accent)]">
            {usdcBalance !== null ? usdcBalance.toFixed(2) : "\u2014"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">Platform escrow balance</div>
        </div>
      </div>

      {/* Deposit */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
            <polyline points="7 13 12 18 17 13" />
            <line x1="12" y1="2" x2="12" y2="18" />
            <line x1="3" y1="22" x2="21" y2="22" />
          </svg>
          Deposit
        </h2>
        <p className="text-xs text-[var(--muted)] mb-3">
          Send USDC to this address on Solana {process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet" : "devnet"}.
        </p>
        {depositAddress ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--code-bg)] text-[var(--foreground)] px-4 py-2.5 rounded-lg text-sm font-mono truncate">
              {depositAddress}
            </code>
            <button
              onClick={copyAddress}
              className="shrink-0 border border-[var(--border)] hover:border-[var(--blue)] px-3 py-2.5 rounded-lg text-xs font-medium transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="text-sm text-[var(--muted)]">Loading deposit address...</div>
        )}
      </div>

      {/* Bridge from another chain */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Bridge from Another Chain
        </h2>
        <p className="text-xs text-[var(--muted)] mb-4">
          Have USDC on Ethereum, Base, Arbitrum, or 60+ other chains? Bridge it directly to your Solana wallet.
        </p>
        {depositAddress
          ? <LiFiDepositWidget walletAddress={depositAddress} />
          : <p className="text-sm text-[var(--muted)]">Loading wallet address...</p>
        }
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
            <input
              type="text"
              value={withdrawDest}
              onChange={(e) => setWithdrawDest(e.target.value)}
              placeholder="Solana address..."
              className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1">Amount (USDC)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              required
            />
          </div>
          {withdrawResult && (
            <div className={`rounded-lg px-4 py-2.5 text-sm ${withdrawResult.ok ? "bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/30" : "bg-red-500/10 text-red-500 border border-red-500/30"}`}>
              {withdrawResult.message}
            </div>
          )}
          <button
            type="submit"
            disabled={withdrawing || !withdrawDest || !withdrawAmount}
            className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
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
    </div>
  );
}
