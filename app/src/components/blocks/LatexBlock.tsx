"use client";
import { useEffect, useRef } from "react";

export function LatexBlock({ content, display = false }: { content: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    import("katex").then((katex) => {
      try {
        katex.default.render(content, ref.current!, { displayMode: display, throwOnError: false, trust: false });
      } catch { if (ref.current) ref.current.textContent = content; }
    });
  }, [content, display]);
  return display
    ? <div className="my-4 overflow-x-auto text-center"><span ref={ref} /></div>
    : <span ref={ref} />;
}
