import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, score: true, createdAt: true, _count: { select: { answers: true } } },
      },
      answers: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { question: { select: { id: true, title: true } } },
      },
      _count: { select: { questions: true, answers: true, votes: true, bookmarks: true } },
      userBadges: {
        include: { badge: { select: { name: true, tier: true, description: true } } },
        orderBy: { awardedAt: "desc" },
      },
    },
  });

  if (!user) notFound();

  const tierColors: Record<string, string> = {
    gold: "bg-yellow-100 text-yellow-800 border-yellow-400",
    silver: "bg-gray-100 text-gray-700 border-gray-400",
    bronze: "bg-amber-50 text-amber-800 border-amber-600",
  };
  const tierDots: Record<string, string> = { gold: "bg-yellow-500", silver: "bg-gray-400", bronze: "bg-amber-600" };

  const goldCount = user.userBadges.filter((b) => b.badge.tier === "gold").length;
  const silverCount = user.userBadges.filter((b) => b.badge.tier === "silver").length;
  const bronzeCount = user.userBadges.filter((b) => b.badge.tier === "bronze").length;

  return (
    <div>
      {/* Profile header */}
      <div className="flex items-start gap-5 mb-8 pb-6 border-b border-[var(--border)]">
        <div
          className={`w-20 h-20 rounded-xl flex items-center justify-center text-white font-bold text-3xl shrink-0 ${
            user.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
          }`}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{user.name}</h1>
          <div className="flex gap-4 text-sm text-gray-500 mt-1 flex-wrap">
            <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium border border-[var(--border)]">
              {user.type}
            </span>
            <span className="font-semibold text-[var(--foreground)]">{user.reputation} reputation</span>
            <span>Joined {timeAgo(user.createdAt)}</span>
          </div>
          {user.bio && <p className="text-sm text-gray-600 mt-2">{user.bio}</p>}

          {/* Badge summary */}
          {user.userBadges.length > 0 && (
            <div className="flex gap-3 mt-3">
              {goldCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${tierDots.gold}`} />
                  {goldCount} gold
                </span>
              )}
              {silverCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${tierDots.silver}`} />
                  {silverCount} silver
                </span>
              )}
              {bronzeCount > 0 && (
                <span className="flex items-center gap-1 text-xs">
                  <span className={`w-2.5 h-2.5 rounded-full ${tierDots.bronze}`} />
                  {bronzeCount} bronze
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { label: "reputation", value: user.reputation },
          { label: "questions", value: user._count.questions },
          { label: "answers", value: user._count.answers },
          { label: "votes cast", value: user._count.votes },
          { label: "bookmarks", value: user._count.bookmarks },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Badges */}
      {user.userBadges.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Badges ({user.userBadges.length})</h2>
          <div className="flex gap-2 flex-wrap">
            {user.userBadges.map((ub) => (
              <div
                key={ub.badge.name}
                className={`border rounded-lg px-3 py-1.5 text-xs font-medium ${tierColors[ub.badge.tier]}`}
                title={ub.badge.description}
              >
                {ub.badge.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Questions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Questions</h2>
          {user.questions.length === 0 && <p className="text-sm text-gray-500">No questions yet.</p>}
          <div className="space-y-2">
            {user.questions.map((q) => (
              <div key={q.id} className="flex items-start gap-3 text-sm">
                <span className={`min-w-[36px] text-center rounded px-1.5 py-0.5 text-xs font-medium ${
                  q.score > 0 ? "bg-[var(--green)] text-white" : "border border-[var(--border)] text-gray-500"
                }`}>
                  {q.score}
                </span>
                <div className="min-w-0">
                  <Link href={`/questions/${q.id}`} className="no-underline text-[var(--blue)] hover:underline line-clamp-1">
                    {q.title}
                  </Link>
                  <div className="text-xs text-gray-400">{q._count.answers} answers &middot; {timeAgo(q.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Answers */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Answers</h2>
          {user.answers.length === 0 && <p className="text-sm text-gray-500">No answers yet.</p>}
          <div className="space-y-2">
            {user.answers.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <span className={`min-w-[36px] text-center rounded px-1.5 py-0.5 text-xs font-medium ${
                  a.isAccepted ? "bg-[var(--green)] text-white" : a.score > 0 ? "bg-gray-100 text-gray-700" : "border border-[var(--border)] text-gray-500"
                }`}>
                  {a.isAccepted ? "\u2713" : a.score}
                </span>
                <div className="min-w-0">
                  <Link href={`/questions/${a.question.id}`} className="no-underline text-[var(--blue)] hover:underline line-clamp-1">
                    {a.question.title}
                  </Link>
                  <div className="text-xs text-gray-400">{timeAgo(a.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
