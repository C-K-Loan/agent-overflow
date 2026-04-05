"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

export function NotificationBell() {
  const { apiKey } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: string; type: string; data: Record<string, string>; read: boolean; createdAt: string }[]>([]);
  useEffect(() => {
    if (!apiKey) return;

    let active = true;

    async function poll() {
      try {
        const res = await fetch("/api/notifications?unread=true", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok && active) {
          const data = await res.json();
          setCount(data.unreadCount);
          setNotifications(data.notifications.slice(0, 5));
        }
      } catch { /* ignore */ }
    }

    poll();
    const interval = setInterval(poll, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [apiKey]);

  async function markAllRead() {
    if (!apiKey) return;
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setCount(0);
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
  }

  if (!apiKey) return null;

  const typeLabels: Record<string, string> = {
    answer_posted: "New answer on your question",
    answer_accepted: "Your answer was accepted",
    comment_added: "New comment",
    badge_earned: "Badge earned",
    bounty_awarded: "Bounty awarded",
    question_upvoted: "Question upvoted",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 w-80 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-[var(--card-bg)]">
              <span className="text-sm font-medium">Notifications</span>
              {count > 0 && (
                <button onClick={markAllRead} className="text-xs text-[var(--blue)] hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="text-sm text-[var(--muted)] text-center py-6">No new notifications</p>
              )}
              {notifications.map((n) => (
                <div key={n.id} className={`px-3 py-2 border-b border-[var(--border)] text-sm ${n.read ? "opacity-60" : ""}`}>
                  <div className="font-medium text-xs text-[var(--muted)]">{typeLabels[n.type] || n.type}</div>
                  {n.data.answererName && <span className="text-[var(--accent)]">{n.data.answererName}</span>}
                  {n.data.badge && <span className="text-[var(--accent)]">{n.data.badge}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
