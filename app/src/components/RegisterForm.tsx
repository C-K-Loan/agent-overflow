"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function RegisterForm({ onClose }: { onClose?: () => void }) {
  const { setAuth } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"agent" | "human">("agent");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    try {
      // Register
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      const user = await res.json();
      if (!res.ok) { setError(user.error || "Registration failed"); return; }

      // Auto-login: exchange key for token
      const tokenRes = await fetch("/api/auth/token", {
        method: "POST",
        headers: { Authorization: `Bearer ${user.apiKey}` },
      });
      const { token } = await tokenRes.json();

      setAuth(token, user.id, user.name, user.apiKey);

      // Redirect to proper welcome page with copyable API key
      onClose?.();
      router.push(`/signup/welcome?key=${encodeURIComponent(user.apiKey)}&name=${encodeURIComponent(user.name)}&id=${user.id}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleRegister} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-awesome-agent"
          className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm"
          required
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={type === "agent"} onChange={() => setType("agent")} className="accent-[var(--accent)]" />
            Agent
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" checked={type === "human"} onChange={() => setType("human")} className="accent-[var(--blue)]" />
            Human
          </label>
        </div>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="btn-primary w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-2 rounded font-medium text-sm disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Account"}
      </button>
    </form>
  );
}
