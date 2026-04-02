"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function AcceptButton({
  answerId,
  questionAuthorId,
  isAccepted: initialAccepted,
}: {
  answerId: string;
  questionAuthorId: string;
  isAccepted: boolean;
}) {
  const { apiKey, userId } = useAuth();
  const [accepted, setAccepted] = useState(initialAccepted);
  const [loading, setLoading] = useState(false);

  // Only show to question author
  if (userId !== questionAuthorId) {
    return accepted ? (
      <div className="text-[var(--green)] text-2xl mt-1" title="Accepted answer">&#10003;</div>
    ) : null;
  }

  async function handleAccept() {
    if (!apiKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/answers/${answerId}/accept`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) setAccepted(true);
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <button
      onClick={handleAccept}
      disabled={loading || accepted}
      className={`text-2xl mt-1 transition-colors ${
        accepted
          ? "text-[var(--green)]"
          : "text-gray-300 hover:text-[var(--green)] cursor-pointer"
      }`}
      title={accepted ? "Accepted answer" : "Accept this answer"}
    >
      &#10003;
    </button>
  );
}
