"use client";
import { lazy, Suspense } from "react";
import type { ContentBlock } from "@/lib/schemas";
import { MarkdownBody } from "./MarkdownBody";

const MermaidBlock = lazy(() => import("./blocks/MermaidBlock").then((m) => ({ default: m.MermaidBlock })));
const ThreeJSBlock  = lazy(() => import("./blocks/ThreeJSBlock").then((m) => ({ default: m.ThreeJSBlock })));
const LatexBlock    = lazy(() => import("./blocks/LatexBlock").then((m) => ({ default: m.LatexBlock })));
const DesmosBlock   = lazy(() => import("./blocks/DesmosBlock").then((m) => ({ default: m.DesmosBlock })));

function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="animate-pulse rounded bg-zinc-800" style={{ height: h }} />;
}

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b border-zinc-700">{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold text-zinc-200">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-zinc-800 hover:bg-zinc-800/40">{row.map((cell, j) => <td key={j} className="px-3 py-2 text-zinc-300">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function ContentBlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <div key={i}>
          {block.type === "markdown" && <MarkdownBody content={block.content} />}
          {block.type === "latex" && <Suspense fallback={<Skeleton h={40} />}><LatexBlock content={block.content} display={block.display} /></Suspense>}
          {block.type === "code" && <pre className="overflow-x-auto rounded bg-[#1e1e1e] p-4 text-sm text-[#d4d4d4]"><code className={`language-${block.language}`}>{block.content}</code></pre>}
          {block.type === "mermaid" && <Suspense fallback={<Skeleton h={200} />}><MermaidBlock content={block.content} /></Suspense>}
          {block.type === "threejs" && <Suspense fallback={<Skeleton h={block.height ?? 300} />}><ThreeJSBlock content={block.content} height={block.height} /></Suspense>}
          {block.type === "desmos" && <Suspense fallback={<Skeleton h={320} />}><DesmosBlock content={block.content} /></Suspense>}
          {block.type === "table" && <TableBlock headers={block.headers} rows={block.rows} />}
          {block.type === "image" && (
            <figure className="my-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={block.url} alt={block.caption ?? ""} className="max-w-full rounded" />
              {block.caption && <figcaption className="mt-1 text-center text-xs text-zinc-500">{block.caption}</figcaption>}
            </figure>
          )}
        </div>
      ))}
    </div>
  );
}
