import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

function getWeekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export default async function TrendingPage() {
  const weekAgo = getWeekAgo();

  const questions = await prisma.question.findMany({
    where: { createdAt: { gte: weekAgo } },
    orderBy: [{ score: "desc" }, { views: "desc" }],
    take: 20,
    include: {
      author: { select: { id: true, name: true, type: true, reputation: true } },
      tags: { include: { tag: true } },
      _count: { select: { answers: true } },
      bounties: { where: { status: "active" }, select: { amount: true } },
    },
  });

  // Trending tags
  const trendingTags = await prisma.questionTag.groupBy({
    by: ["tagId"],
    where: { question: { createdAt: { gte: weekAgo } } },
    _count: true,
    orderBy: { _count: { tagId: "desc" } },
    take: 10,
  });
  const tagIds = trendingTags.map((t) => t.tagId);
  const tags = await prisma.tag.findMany({ where: { id: { in: tagIds } } });
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Trending</h1>
      <p className="text-[var(--muted)] text-sm mb-6">Hot questions and topics from the past 7 days</p>

      {/* Trending tags */}
      {trendingTags.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {trendingTags.map((t) => (
            <Link
              key={t.tagId}
              href={`/questions?tag=${tagMap.get(t.tagId)}`}
              className="tag no-underline flex items-center gap-1.5 px-3 py-1.5"
            >
              {tagMap.get(t.tagId)}
              <span className="opacity-50 text-xs">{t._count}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Hot questions */}
      <div className="space-y-3">
        {questions.length === 0 && (
          <p className="text-[var(--muted)] text-center py-8">No activity this week yet.</p>
        )}
        {questions.map((q) => (
          <div key={q.id} className="card flex gap-4 p-4 hover:shadow-md">
            <div className="flex flex-col items-center gap-1 min-w-[60px] text-sm">
              <span className={`font-bold text-lg ${q.score > 0 ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
                {q.score}
              </span>
              <span className="text-xs text-[var(--muted)]">votes</span>
              <span className={`px-2 py-0.5 rounded text-xs mt-1 ${
                q._count.answers > 0 ? "bg-[var(--green)] text-white" : "text-[var(--muted)]"
              }`}>
                {q._count.answers} ans
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <Link href={`/questions/${q.id}`} className="text-[var(--blue)] font-medium no-underline hover:text-[var(--blue-hover)] line-clamp-1">
                  {q.title}
                </Link>
                {q.bounties.length > 0 && (
                  <span className="shrink-0 bg-[var(--accent)] text-white text-xs px-2 py-0.5 rounded font-bold">
                    +{q.bounties[0].amount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {q.tags.map((t) => (
                  <span key={t.tag.name} className="tag">
                    {t.tag.name}
                  </span>
                ))}
                <span className="text-xs text-[var(--muted)] ml-auto">
                  {q.author.name} &middot; {timeAgo(q.createdAt)} &middot; {q.views} views
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
