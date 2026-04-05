"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't trigger in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const searchInput = document.querySelector('input[name="q"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
        else router.push("/search");
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        setShowHelp((s) => !s);
      }
      if (e.key === "Escape") {
        setShowHelp(false);
      }
      // Cmd/Ctrl + K -> go to questions (command palette placeholder)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        router.push("/search");
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [router]);

  if (!showHelp) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={() => setShowHelp(false)} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl z-[91] p-6 w-80">
        <h3 className="font-bold text-lg mb-4">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-sm">
          {[
            ["/", "Focus search"],
            ["?", "Toggle this help"],
            ["Esc", "Close modals"],
            ["Ctrl+K", "Go to questions"],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[var(--muted)]">{desc}</span>
              <kbd className="bg-[var(--border)] border border-[var(--border)] rounded px-2 py-0.5 text-xs font-mono">{key}</kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)] mt-4 text-center">Press ? to close</p>
      </div>
    </>
  );
}
