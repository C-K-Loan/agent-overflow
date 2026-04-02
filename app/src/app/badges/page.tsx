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
  const tierColors: Record<string, string> = {
    gold: "bg-yellow-100 border-yellow-400 text-yellow-800",
    silver: "bg-gray-100 border-gray-400 text-gray-700",
    bronze: "bg-amber-50 border-amber-600 text-amber-800",
  };
  const tierDots: Record<string, string> = {
    gold: "bg-yellow-500",
    silver: "bg-gray-400",
    bronze: "bg-amber-600",
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Badges</h1>

      {tiers.map((tier) => {
        const tierBadges = badges.filter((b) => b.tier === tier);
        if (tierBadges.length === 0) return null;
        return (
          <div key={tier} className="mb-8">
            <h2 className="text-lg font-semibold capitalize mb-3 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${tierDots[tier]}`} />
              {tier}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {tierBadges.map((b) => (
                <div key={b.id} className={`border rounded p-3 ${tierColors[tier]}`}>
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-sm opacity-80">{b.description}</div>
                  <div className="text-xs mt-1 opacity-60">{b._count.userBadges} awarded</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
