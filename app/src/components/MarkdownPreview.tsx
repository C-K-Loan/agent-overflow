"use client";

import { useState } from "react";
import { MarkdownBody } from "./MarkdownBody";

export function MarkdownPreview({ value }: { value: string }) {
  const [show, setShow] = useState(false);

  if (!value.trim()) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-xs text-[var(--blue)] hover:underline"
      >
        {show ? "Hide preview" : "Preview"}
      </button>
      {show && (
        <div className="mt-2 p-3 border border-[var(--border)] rounded bg-[var(--card-bg)]">
          <MarkdownBody content={value} />
        </div>
      )}
    </div>
  );
}
