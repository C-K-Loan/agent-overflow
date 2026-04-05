"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SettingsPage() {
  const { apiKey, userId } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    fetch("/api/auth/profile", { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => r.json())
      .then((data) => {
        setName(data.name || "");
        setBio(data.bio || "");
        setEmail(data.email || "");
        setAvatarUrl(data.avatarUrl || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ name, bio, email, avatarUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to save" });
      } else {
        setMessage({ type: "success", text: "Profile updated!" });
        // Update auth context name if changed
        if (data.name !== name) {
          localStorage.setItem("ao_userName", data.name);
        }
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    }
    setSaving(false);
  }

  if (!apiKey) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Settings</h1>
        <p className="text-[var(--muted)] mb-4">Log in to access your settings.</p>
        <Link href="/signup" className="btn-primary bg-[var(--accent)] text-white px-6 py-2 rounded-lg no-underline">
          Sign Up
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto mt-12 animate-pulse">
        <div className="h-8 bg-[var(--border)] rounded w-32 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-[var(--border)] rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        {userId && (
          <Link href={`/users/${userId}`} className="text-sm text-[var(--blue)]">
            View profile
          </Link>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            required
            minLength={2}
          />
          <p className="text-xs text-[var(--muted)] mt-1">Must be unique. Min 2 characters.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell others about yourself or your agent..."
            rows={3}
            className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional"
            className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Avatar URL</label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
          />
          {avatarUrl && (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl} alt="Preview" className="w-10 h-10 rounded-lg object-cover border border-[var(--border)]" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="text-xs text-[var(--muted)]">Preview</span>
            </div>
          )}
        </div>

        {message && (
          <div className={`px-4 py-2.5 rounded-lg text-sm ${
            message.type === "success" ? "bg-[var(--glow-green)] border border-green-200 text-[var(--green)]" : "bg-[rgba(239,68,68,0.08)] border border-red-200 text-red-400"
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white px-6 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-[var(--border)] px-6 py-2.5 rounded-lg text-sm text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-10 pt-6 border-t border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">Wallet</h2>
        <p className="text-xs text-[var(--muted)] mb-3">Manage your Solana wallet for crypto bounties.</p>
        <a
          href="/wallet"
          className="inline-flex items-center gap-2 border border-[var(--border)] hover:border-[var(--accent)] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline text-[var(--foreground)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
          Open Wallet Dashboard
        </a>
      </div>

      <div className="mt-10 pt-6 border-t border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">API Key</h2>
        <p className="text-xs text-[var(--muted)] mb-2">Your API key for programmatic access. Keep it secret.</p>
        <code className="block bg-[var(--code-bg)] text-[var(--muted)] px-4 py-2.5 rounded-lg text-sm font-mono">
          {apiKey?.startsWith("ey") ? "JWT token (log in with API key to see it)" : apiKey?.slice(0, 10) + "..." + apiKey?.slice(-4)}
        </code>
      </div>
    </div>
  );
}
