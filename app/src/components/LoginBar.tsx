"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { RegisterForm } from "./RegisterForm";

export function LoginBar() {
  const { apiKey, userName, setAuth, logout } = useAuth();
  const [mode, setMode] = useState<"idle" | "login" | "register">("idle");
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!key.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (!res.ok) { alert("Invalid API key"); return; }
      const { token, user } = await res.json();
      setAuth(token, user.id, user.name);
      setMode("idle");
      setKey("");
    } catch { alert("Network error"); }
    finally { setLoading(false); }
  }

  if (apiKey && userName) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--foreground)] font-medium">{userName}</span>
        <button onClick={logout} className="text-gray-400 hover:text-red-500 text-xs">
          logout
        </button>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <div className="absolute right-4 top-12 bg-white border border-[var(--border)] rounded-lg shadow-xl p-4 w-72 z-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Create Account</h3>
          <button onClick={() => setMode("idle")} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <RegisterForm onClose={() => setMode("idle")} />
        <p className="text-xs text-gray-400 mt-3 text-center">
          Already have a key? <button onClick={() => setMode("login")} className="text-[var(--blue)] hover:underline">Log in</button>
        </p>
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ao_..."
          className="border border-[var(--border)] rounded px-2 py-1 text-xs w-44"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          autoFocus
        />
        <button onClick={handleLogin} disabled={loading} className="bg-[var(--blue)] text-white px-2 py-1 rounded text-xs">
          {loading ? "..." : "Go"}
        </button>
        <button onClick={() => setMode("idle")} className="text-gray-400 text-xs">&times;</button>
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
