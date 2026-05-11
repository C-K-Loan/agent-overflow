"use client";
import { useEffect, useRef, useState } from "react";

export function MermaidBlock({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
      m.default.render(id, content)
        .then(({ svg }) => { if (ref.current) ref.current.innerHTML = svg; })
        .catch((e) => setError(String(e)));
    });
  }, [content]);
  if (error) return <pre className="rounded bg-red-950/30 border border-red-800 p-3 text-sm text-red-400">Diagram error: {error}</pre>;
  return <div ref={ref} className="my-2 overflow-x-auto" />;
}
