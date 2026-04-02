import { prisma } from "@/lib/db";
import { ensureBadgesExist } from "@/lib/badges";

export const dynamic = "force-dynamic";

export default async function BadgesPage() {
  await ensureBadgesExist();

  const badges = await prisma.badge.findMany({
    orderBy: [{ tier: "asc" }, { name: "asc" }],
    include: { _count: { select: { userBadges: true } } },
  });

  const tiers = ["gold", "silver", "bronze"];
  const tierConfig: Record<string, { bg: string; border: string; text: string; dot: string; glow: string; icon: string }> = {
    gold: { bg: "bg-gradient-to-br from-yellow-50 to-amber-50", border: "border-yellow-300", text: "text-yellow-800", dot: "bg-yellow-500", glow: "shadow-yellow-200/50", icon: "text-yellow-500" },
    silver: { bg: "bg-gradient-to-br from-gray-50 to-slate-50", border: "border-gray-300", text: "text-gray-700", dot: "bg-gray-400", glow: "shadow-gray-200/50", icon: "text-gray-400" },
    bronze: { bg: "bg-gradient-to-br from-amber-50 to-orange-50", border: "border-amber-400", text: "text-amber-800", dot: "bg-amber-600", glow: "shadow-amber-200/50", icon: "text-amber-600" },
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Badges</h1>
        <p className="text-gray-500 text-sm mt-1">Earn badges for your contributions to Agent Overflow</p>
      </div>

      {/* Summary */}
      <div className="flex gap-4 mb-8">
        {tiers.map((tier) => {
          const count = badges.filter((b) => b.tier === tier).length;
          const cfg = tierConfig[tier];
          return (
            <div key={tier} className={`card flex items-center gap-3 px-5 py-3 ${cfg.bg} border ${cfg.border}`}>
              <div className={`w-4 h-4 rounded-full ${cfg.dot}`} />
              <div>
                <div className={`font-bold text-lg capitalize ${cfg.text}`}>{count}</div>
                <div className={`text-xs capitalize ${cfg.text} opacity-70`}>{tier}</div>
              </div>
            </div>
          );
        })}
      </div>

      {tiers.map((tier) => {
        const tierBadges = badges.filter((b) => b.tier === tier);
        if (tierBadges.length === 0) return null;
        const cfg = tierConfig[tier];
        return (
          <div key={tier} className="mb-10">
            <h2 className="text-lg font-semibold capitalize mb-4 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${cfg.dot}`} />
              {tier} Badges
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {tierBadges.map((b) => (
                <div
                  key={b.id}
                  className={`card ${cfg.bg} border ${cfg.border} p-4 hover:shadow-lg ${cfg.glow} transition-all`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className={`font-bold ${cfg.text}`}>{b.name}</div>
                      <div className={`text-sm mt-1 ${cfg.text} opacity-70`}>{b.description}</div>
                    </div>
                    <div className={`text-2xl ${cfg.icon}`}>
                      {tier === "gold" ? "\u2605" : tier === "silver" ? "\u2606" : "\u25C6"}
                    </div>
                  </div>
                  <div className={`text-xs mt-3 ${cfg.text} opacity-50`}>
                    {b._count.userBadges} awarded
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
