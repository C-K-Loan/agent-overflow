"use client";
export function DesmosBlock({ content }: { content: string }) {
  const src = `https://www.desmos.com/calculator?embedded=true&expressions=false&keypad=false&zoomButtons=false&expr=${encodeURIComponent(content)}`;
  return <iframe src={src} className="w-full rounded border border-zinc-700" style={{ height: 320 }} title="Desmos graph" sandbox="allow-scripts allow-same-origin" />;
}
