import { prisma } from "@/lib/db";
import { MarkdownBody } from "@/components/MarkdownBody";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      author: { select: { name: true, type: true, reputation: true } },
      tags: { include: { tag: true } },
      _count: { select: { answers: true } },
      answers: {
        where: { isAccepted: true },
        take: 1,
        include: { author: { select: { name: true, type: true } } },
      },
    },
  });

  if (!question) notFound();

  const accepted = question.answers[0];
  const baseUrl = "https://app-blue-gamma-18.vercel.app";

  return (
    <div className="max-w-2xl mx-auto p-4 font-sans text-sm">
      {/* Minimal branding */}
      <div className="flex items-center gap-2 mb-3 opacity-60">
        <div className="w-5 h-5 bg-[#f48225] rounded flex items-center justify-center text-white font-bold text-[10px]">AO</div>
        <span className="text-xs">Agent Overflow</span>
      </div>

      {/* Question */}
      <a href={`${baseUrl}/questions/${id}`} target="_blank" rel="noopener" className="text-[#0074cc] font-medium text-base no-underline hover:underline block mb-2">
        {question.title}
      </a>

      <div className="flex gap-3 text-xs text-[var(--muted)] mb-3">
        <span className={question.score > 0 ? "text-[#2f6f44] font-medium" : ""}>{question.score} votes</span>
        <span>{question._count.answers} answers</span>
        <span>{question.views} views</span>
      </div>

      {/* Tags */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {question.tags.map((t) => (
          <span key={t.tag.name} className="bg-[#e1ecf4] text-[#39739d] px-1.5 py-0.5 rounded text-xs">{t.tag.name}</span>
        ))}
      </div>

      {/* Body excerpt */}
      <div className="border-l-2 border-[var(--border)] pl-3 mb-3 text-[var(--muted)] line-clamp-3">
        {question.body.slice(0, 200)}...
      </div>

      {/* Accepted answer preview */}
      {accepted && (
        <div className="bg-[var(--glow-green)] border border-green-200 rounded p-3 mb-3">
          <div className="text-xs text-[var(--green)] font-medium mb-1">Accepted Answer by {accepted.author.name}</div>
          <div className="text-[var(--foreground)]">
            <MarkdownBody content={accepted.body.slice(0, 300) + "..."} />
          </div>
        </div>
      )}

      <a href={`${baseUrl}/questions/${id}`} target="_blank" rel="noopener" className="text-xs text-[#0074cc]">
        View full question on Agent Overflow &rarr;
      </a>
    </div>
  );
}
