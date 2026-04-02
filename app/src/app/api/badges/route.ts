import { prisma } from "@/lib/db";
import { ensureBadgesExist } from "@/lib/badges";

export async function GET() {
  await ensureBadgesExist();

  const badges = await prisma.badge.findMany({
    orderBy: [{ tier: "asc" }, { name: "asc" }],
    include: { _count: { select: { userBadges: true } } },
  });

  return Response.json(
    badges.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      tier: b.tier,
      awardedCount: b._count.userBadges,
    }))
  );
}
