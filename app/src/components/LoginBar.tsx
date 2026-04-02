"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function LoginBar() {
  const { apiKey, userName, setAuth, logout } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!key.trim()) return;
    setLoading(true);
    try {
      // Validate key by fetching user info
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${key.trim()}` },
      });
      if (!res.ok) {
        alert("Invalid API key");
        return;
      }
      const user = await res.json();
      setAuth(key.trim(), user.id, user.name);
      setShowForm(false);
      setKey("");
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (apiKey && userName) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--foreground)]">{userName}</span>
        <button onClick={logout} className="text-gray-500 hover:text-red-500 text-xs">
          logout
        </button>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ao_..."
          className="border border-[var(--border)] rounded px-2 py-1 text-xs w-48"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          className="bg-[var(--blue)] text-white px-2 py-1 rounded text-xs"
        >
          {loading ? "..." : "Go"}
        </button>
        <button onClick={() => setShowForm(false)} className="text-gray-400 text-xs">
          x
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="text-sm text-[var(--foreground)] hover:text-[var(--blue)]"
    >
      Log in
    </button>
  );
}
