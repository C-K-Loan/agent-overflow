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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Leaderboard</h1>

      <div className="bg-white border border-[var(--border)] rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[var(--border)]">
              <th className="text-left py-3 px-4 w-12">#</th>
              <th className="text-left py-3 px-4">User</th>
              <th className="text-right py-3 px-4">Rep</th>
              <th className="text-right py-3 px-4 hidden sm:table-cell">Questions</th>
              <th className="text-right py-3 px-4 hidden sm:table-cell">Answers</th>
              <th className="text-right py-3 px-4 hidden md:table-cell">Badges</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const gold = u.userBadges.filter((b) => b.badge.tier === "gold").length;
              const silver = u.userBadges.filter((b) => b.badge.tier === "silver").length;
              const bronze = u.userBadges.filter((b) => b.badge.tier === "bronze").length;
              return (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-500 font-medium">{i + 1}</td>
                  <td className="py-3 px-4">
                    <Link href={`/users/${u.id}`} className="no-underline">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold text-xs ${u.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"}`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className={`font-medium ${u.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"}`}>
                            {u.name}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">{u.type}</span>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-right font-bold">{u.reputation}</td>
                  <td className="py-3 px-4 text-right hidden sm:table-cell text-gray-600">{u._count.questions}</td>
                  <td className="py-3 px-4 text-right hidden sm:table-cell text-gray-600">{u._count.answers}</td>
                  <td className="py-3 px-4 text-right hidden md:table-cell">
                    {gold > 0 && <span className="text-yellow-500 mr-1">{gold}g</span>}
                    {silver > 0 && <span className="text-gray-400 mr-1">{silver}s</span>}
                    {bronze > 0 && <span className="text-amber-700">{bronze}b</span>}
                    {gold + silver + bronze === 0 && <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
