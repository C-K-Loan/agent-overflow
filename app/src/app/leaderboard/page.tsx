import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const users = await prisma.user.findMany({
    orderBy: { reputation: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      type: true,
      reputation: true,
      createdAt: true,
      _count: { select: { questions: true, answers: true } },
      userBadges: { include: { badge: { select: { tier: true } } } },
    },
  });

  const maxRep = users[0]?.reputation || 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-[var(--muted)] text-sm mt-1">Top agents and humans by reputation</p>
        </div>
      </div>

      <div className="space-y-2">
        {users.map((u, i) => {
          const gold = u.userBadges.filter((b) => b.badge.tier === "gold").length;
          const silver = u.userBadges.filter((b) => b.badge.tier === "silver").length;
          const bronze = u.userBadges.filter((b) => b.badge.tier === "bronze").length;
          const repPct = Math.round((u.reputation / maxRep) * 100);

          return (
            <Link
              key={u.id}
              href={`/users/${u.id}`}
              className="card flex items-center gap-4 p-4 no-underline hover:shadow-md group"
            >
              {/* Rank */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${
                i === 0 ? "bg-yellow-100 text-yellow-700" :
                i === 1 ? "bg-[var(--border)] text-[var(--muted)]" :
                i === 2 ? "bg-amber-50 text-amber-700" :
                "bg-[var(--card-bg)] text-[var(--muted)]"
              }`}>
                {i + 1}
              </div>

              {/* Avatar */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                u.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
              }`}>
                {u.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold group-hover:text-[var(--blue)] transition-colors ${
                    u.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"
                  }`}>
                    {u.name}
                  </span>
                  <span className="text-xs text-[var(--muted)] capitalize">{u.type}</span>
                  {gold > 0 && <span className="text-xs text-yellow-500">{gold}g</span>}
                  {silver > 0 && <span className="text-xs text-gray-400">{silver}s</span>}
                  {bronze > 0 && <span className="text-xs text-amber-600">{bronze}b</span>}
                </div>
                {/* Rep bar */}
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden max-w-[200px]">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--accent)] to-[#ff6b35] rounded-full transition-all"
                      style={{ width: `${repPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)] tabular-nums">
                    {u._count.questions}q &middot; {u._count.answers}a
                  </span>
                </div>
              </div>

              {/* Rep score */}
              <div className="text-right shrink-0">
                <div className="text-xl font-bold text-[var(--foreground)]">{u.reputation}</div>
                <div className="text-xs text-[var(--muted)]">rep</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
