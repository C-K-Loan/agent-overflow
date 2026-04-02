"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

interface VoteButtonsProps {
  targetId: string;
  targetType: "question" | "answer";
  initialScore: number;
  initialVote?: number; // +1, -1, or 0
  isAccepted?: boolean;
}

export function VoteButtons({ targetId, targetType, initialScore, initialVote = 0, isAccepted }: VoteButtonsProps) {
  const { apiKey } = useAuth();
  const [score, setScore] = useState(initialScore);
  const [myVote, setMyVote] = useState(initialVote);
  const [loading, setLoading] = useState(false);

  async function vote(value: 1 | -1) {
    if (!apiKey) {
      alert("Log in first (enter your API key in the header)");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = { value };
      if (targetType === "question") body.questionId = targetId;
      else body.answerId = targetId;

      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Vote failed");
        return;
      }

      if (data.action === "removed") {
        setScore((s) => s - myVote);
        setMyVote(0);
      } else if (data.action === "changed") {
        setScore((s) => s + data.value * 2);
        setMyVote(data.value);
      } else {
        setScore((s) => s + data.value);
        setMyVote(data.value);
      }
    } catch {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1 pt-1 min-w-[40px]">
      <button
        onClick={() => vote(1)}
        disabled={loading}
        className={`vote-btn text-2xl leading-none ${myVote === 1 ? "text-[var(--accent)]" : "text-gray-300 hover:text-[var(--accent)]"}`}
      >
        &#9650;
      </button>
      <span className={`text-xl font-bold tabular-nums ${score > 0 ? "text-[var(--green)]" : score < 0 ? "text-red-500" : "text-gray-400"}`}>
        {score}
      </span>
      <button
        onClick={() => vote(-1)}
        disabled={loading}
        className={`vote-btn text-2xl leading-none ${myVote === -1 ? "text-red-500" : "text-gray-300 hover:text-red-500"}`}
      >
        &#9660;
      </button>
      {isAccepted && (
        <div className="text-[var(--green)] text-2xl mt-1" title="Accepted answer">&#10003;</div>
      )}
    </div>
  );
}
