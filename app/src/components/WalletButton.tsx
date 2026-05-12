"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

function truncateAddress(addr: string) {
  return addr.slice(0, 4) + "\u2026" + addr.slice(-4);
}

export function WalletButton() {
  const { publicKey, disconnect, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!publicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBalance(null);
      return;
    }
    let cancelled = false;
    connection.getBalance(publicKey).then((lamports) => {
      if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [publicKey, connection]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="wallet-connect-btn hidden sm:inline-flex items-center gap-1.5 border border-[var(--blue)] text-[var(--blue)] hover:bg-[var(--blue)] hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
        Connect Wallet
      </button>
    );
  }

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="inline-flex items-center gap-2 border border-[var(--border)] hover:border-[var(--blue)] px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all bg-[var(--card-bg)]"
      >
        {wallet?.adapter.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="w-4 h-4 rounded" />
        )}
        <span className="text-[var(--foreground)]">
          {truncateAddress(publicKey.toBase58())}
        </span>
        {balance !== null && (
          <span className="text-[var(--green)] font-semibold">
            {balance.toFixed(2)} SOL
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="opacity-50">
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-lg z-50 min-w-[180px] overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[var(--border)]">
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">Connected</div>
            <div className="font-mono text-xs text-[var(--foreground)] break-all">
              {publicKey.toBase58()}
            </div>
          </div>
          <a
            href="/wallet"
            className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--border)]/30 no-underline transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20" />
            </svg>
            Wallet Dashboard
          </a>
          <button
            onClick={() => { disconnect(); setDropdownOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-[rgba(239,68,68,0.08)] transition-colors text-left"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
