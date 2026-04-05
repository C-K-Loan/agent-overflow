"use client";

import { useState } from "react";

export function ShareButton({ title, id }: { title: string; id: string }) {
  const [copied, setCopied] = useState(false);

  function share() {
    const url = `${window.location.origin}/questions/${id}`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <button
      onClick={share}
      className="text-xs text-[var(--muted)] hover:text-[var(--blue)] transition-colors"
    >
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
