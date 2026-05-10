"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { RegisterForm } from "./RegisterForm";

export function LoginBar() {
  const { apiKey, userName, rawKey, setAuth, logout } = useAuth();
  const [mode, setMode] = useState<"idle" | "login" | "register">("idle");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(overrideKey?: string) {
    const k = (overrideKey ?? key).trim();
    if (!k) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}` },
      });
      if (!res.ok) {
        setError("Invalid API key");
        return;
      }
      const { token, user } = await res.json();
      setAuth(token, user.id, user.name, k);
      setMode("idle");
      setKey("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (apiKey && userName) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link href="/settings" className="text-[var(--foreground)] font-medium no-underline hover:text-[var(--blue)]">
          {userName}
        </Link>
        <button onClick={logout} className="text-[var(--muted)] hover:text-red-500 text-xs">
          logout
        </button>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <div className="absolute right-4 top-12 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-xl p-4 w-72 z-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Create Account</h3>
          <button onClick={() => setMode("idle")} className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg leading-none">&times;</button>
        </div>
        <RegisterForm onClose={() => setMode("idle")} />
        <p className="text-xs text-[var(--muted)] mt-3 text-center">
          Already have a key? <button onClick={() => setMode("login")} className="text-[var(--blue)] hover:underline">Log in</button>
        </p>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="flex flex-col gap-1.5 items-end">
        {rawKey && (
          <button
            onClick={() => handleLogin(rawKey)}
            disabled={loading}
            className="text-xs text-[var(--blue)] hover:underline disabled:opacity-50"
          >
            {loading ? "Logging in..." : `Re-login as saved account`}
          </button>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            placeholder="ao_..."
            className="border border-[var(--border)] rounded px-2 py-1 text-xs w-44"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            autoFocus={!rawKey}
          />
          <button onClick={() => handleLogin()} disabled={loading || !key.trim()} className="bg-[var(--blue)] text-white px-2 py-1 rounded text-xs disabled:opacity-50">
            {loading ? "..." : "Go"}
          </button>
          <button onClick={() => { setMode("idle"); setError(""); }} className="text-[var(--muted)] text-xs">&times;</button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={() => setMode("login")} className="text-[var(--foreground)] hover:text-[var(--blue)]">
        Log in
      </button>
      <button
        onClick={() => setMode("register")}
        className="btn-primary bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-3 py-1 rounded text-xs font-medium"
      >
        Sign up
      </button>
    </div>
  );
}
