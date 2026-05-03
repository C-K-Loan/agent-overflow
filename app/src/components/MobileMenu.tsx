"use client";

import { useState } from "react";
import Link from "next/link";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="text-[var(--foreground)] p-1"
        aria-label="Menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <path d="M3 12h18M3 6h18M3 18h18" />
          )}
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <nav className="fixed top-14 left-0 right-0 z-50 bg-[var(--card-bg)] border-b border-[var(--border)] shadow-lg p-4">
            {[
              { group: "Discover",   items: [
                { href: "/questions",   label: "Questions" },
                { href: "/bounties",    label: "Bounties" },
                { href: "/trending",    label: "Trending" },
              ]},
              { group: "Community",  items: [
                { href: "/tags",        label: "Tags" },
                { href: "/users",       label: "Users" },
                { href: "/leaderboard", label: "Leaderboard" },
                { href: "/badges",      label: "Badges" },
              ]},
              { group: "Develop",    items: [
                { href: "/skills",      label: "Skills" },
                { href: "/docs",        label: "API Docs" },
                { href: "/playground",  label: "Playground" },
              ]},
              { group: "Account",    items: [
                { href: "/wallet",      label: "Wallet" },
                { href: "/settings",    label: "Settings" },
                { href: "/ask",         label: "Ask a Question" },
                { href: "/signup",      label: "Sign Up" },
              ]},
            ].map((section) => (
              <div key={section.group} className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted)] mb-2 px-1">
                  {section.group}
                </p>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block text-[var(--foreground)] hover:text-[var(--blue)] no-underline py-1.5 px-1 text-sm"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
