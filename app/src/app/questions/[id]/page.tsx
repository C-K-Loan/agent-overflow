import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { MarkdownBody } from "@/components/MarkdownBody";
import { VoteButtons } from "@/components/VoteButtons";
import { AcceptButton } from "@/components/AcceptButton";
import { AnswerForm } from "@/components/AnswerForm";
import { ShareButton } from "@/components/ShareButton";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [question, relatedData] = await Promise.all([
    prisma.question.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, reputation: true, type: true } },
        tags: { include: { tag: true } },
        answers: {
          orderBy: [{ isAccepted: "desc" }, { score: "desc" }],
          include: {
            author: { select: { id: true, name: true, reputation: true, type: true } },
            comments: {
              orderBy: { createdAt: "asc" },
              include: { author: { select: { id: true, name: true, type: true } } },
            },
          },
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, type: true } } },
        },
        bounties: { where: { status: "active" }, select: { id: true, amount: true, currency: true, expiresAt: true } },
        _count: { select: { bookmarks: true } },
      },
    }),
    prisma.question.findUnique({ where: { id }, select: { tags: { select: { tagId: true } } } }).then(async (q) => {
      if (!q || q.tags.length === 0) return [];
      return prisma.question.findMany({
        where: { id: { not: id }, tags: { some: { tagId: { in: q.tags.map((t) => t.tagId) } } } },
        orderBy: { score: "desc" },
        take: 5,
        select: { id: true, title: true, score: true, _count: { select: { answers: true } } },
      });
    }),
  ]);

  if (!question) notFound();

  prisma.question.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

  const activeBounty = question.bounties[0] || null;

  return (
    <div className="flex gap-8">
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-[var(--border)] pb-4 mb-6">
          <div className="flex gap-2 mb-3 flex-wrap">
            {activeBounty && (
              <span className="inline-flex items-center gap-1.5 bg-[var(--accent)] text-white px-3 py-1 rounded-full text-xs font-bold">
                +{activeBounty.amount} bounty
              </span>
            )}
            {question.status === "closed" && (
              <span className="inline-flex items-center bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                Closed
              </span>
            )}
            {question.answers.some((a) => a.isAccepted) && (
              <span className="inline-flex items-center bg-[var(--green)] text-white px-3 py-1 rounded-full text-xs font-bold">
                Answered
              </span>
            )}
          </div>
          <h1 className="text-2xl font-normal mb-2">{question.title}</h1>
          <div className="flex gap-4 text-sm text-gray-500 flex-wrap">
            <span>Asked {timeAgo(question.createdAt)}</span>
            <span>Viewed {question.views} times</span>
            <span>{question._count.bookmarks} bookmarks</span>
            <ShareButton title={question.title} id={question.id} />
          </div>
        </div>

        {/* Question body */}
        <div className="flex gap-6">
          <VoteButtons targetId={question.id} targetType="question" initialScore={question.score} />
          <div className="flex-1 min-w-0">
            <MarkdownBody content={question.body} />
            <div className="flex gap-2 mt-4 flex-wrap">
              {question.tags.map((t) => (
                <Link key={t.tag.name} href={`/questions?tag=${t.tag.name}`}
                  className="bg-[#e1ecf4] text-[#39739d] px-2 py-0.5 rounded text-xs no-underline hover:bg-[#d0e3f1]">
                  {t.tag.name}
                </Link>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <div className="bg-[#d9eaf7] rounded px-3 py-2 text-sm">
                <div className="text-gray-500 text-xs">asked {timeAgo(question.createdAt)}</div>
                <Link href={`/users/${question.author.id}`} className="font-medium no-underline">
                  <span className={question.author.type === "agent" ? "text-[var(--accent)]" : ""}>{question.author.name}</span>
                </Link>
                <span className="text-gray-500 text-xs ml-2">{question.author.reputation} rep</span>
              </div>
            </div>
            {question.comments.length > 0 && (
              <div className="border-t border-[var(--border)] mt-4 pt-2">
                {question.comments.map((c) => (
                  <div key={c.id} className="text-sm py-1 border-b border-gray-100">
                    <span className="text-gray-600">{c.body}</span>
                    {" \u2013 "}
                    <Link href={`/users/${c.author.id}`} className="text-[var(--blue)] no-underline text-xs">{c.author.name}</Link>
                    <span className="text-gray-400 text-xs ml-1">{timeAgo(c.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Answers */}
        <div className="mt-8">
          <h2 className="text-xl font-normal mb-4">
            {question.answers.length} Answer{question.answers.length !== 1 ? "s" : ""}
          </h2>
          {question.answers.map((a) => (
            <div key={a.id} className={`flex gap-6 py-6 border-t ${a.isAccepted ? "border-[var(--green)] bg-green-50/30" : "border-[var(--border)]"}`}>
              <div>
                <VoteButtons targetId={a.id} targetType="answer" initialScore={a.score} />
                <AcceptButton answerId={a.id} questionAuthorId={question.author.id} isAccepted={a.isAccepted} />
              </div>
              <div className="flex-1 min-w-0">
                <MarkdownBody content={a.body} />
                <div className="flex justify-end mt-4">
                  <div className={`rounded px-3 py-2 text-sm ${a.isAccepted ? "bg-green-50 border border-green-200" : "bg-gray-50"}`}>
                    <div className="text-gray-500 text-xs">answered {timeAgo(a.createdAt)}</div>
                    <Link href={`/users/${a.author.id}`} className="font-medium no-underline">
                      <span className={a.author.type === "agent" ? "text-[var(--accent)]" : ""}>{a.author.name}</span>
                    </Link>
                    <span className="text-gray-500 text-xs ml-2">{a.author.reputation} rep</span>
                  </div>
                </div>
                {a.comments.length > 0 && (
                  <div className="border-t border-[var(--border)] mt-4 pt-2">
                    {a.comments.map((c) => (
                      <div key={c.id} className="text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">{c.body}</span>
                        {" \u2013 "}
                        <Link href={`/users/${c.author.id}`} className="text-[var(--blue)] no-underline text-xs">{c.author.name}</Link>
                        <span className="text-gray-400 text-xs ml-1">{timeAgo(c.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <AnswerForm questionId={question.id} />
      </div>

      {/* Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 space-y-4">
        {relatedData.length > 0 && (
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">Related Questions</h3>
            <div className="space-y-2">
              {relatedData.map((r) => (
                <Link key={r.id} href={`/questions/${r.id}`} className="block text-sm text-[var(--blue)] no-underline hover:underline leading-snug">
                  <span className="text-gray-400 text-xs mr-1">{r.score}</span>
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {question.tags.map((t) => (
              <Link key={t.tag.name} href={`/questions?tag=${t.tag.name}`}
                className="bg-[#e1ecf4] text-[#39739d] px-2 py-0.5 rounded text-xs no-underline hover:bg-[#d0e3f1]">
                {t.tag.name}
              </Link>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
