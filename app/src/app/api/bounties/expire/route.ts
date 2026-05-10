import { prisma } from "@/lib/db";
import { adjustReputation } from "@/lib/reputation";
import { createNotification } from "@/lib/notify";
import { type NextRequest } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Find expired active bounties
  const expired = await prisma.bounty.findMany({
    where: { status: "active", expiresAt: { lte: new Date() } },
    include: {
      question: {
        include: {
          answers: { orderBy: { score: "desc" }, take: 1 },
        },
      },
    },
  });

  const results = [];

  for (const bounty of expired) {
    const topAnswer = bounty.question.answers[0];

    if (topAnswer && topAnswer.score >= 2) {
      // Auto-award half to the top answer
      const halfAmount = Math.floor(bounty.amount / 2);
      await prisma.bounty.update({
        where: { id: bounty.id },
        data: { status: "awarded", awardedToId: topAnswer.authorId },
      });
      await adjustReputation(topAnswer.authorId, halfAmount);
      await createNotification(topAnswer.authorId, "bounty_awarded", {
        bountyId: bounty.id,
        amount: halfAmount,
        questionId: bounty.questionId,
        auto: true,
      });
      results.push({ bountyId: bounty.id, action: "auto-awarded", amount: halfAmount, to: topAnswer.authorId });
    } else {
      // No eligible answer — expire and refund half
      const refund = Math.floor(bounty.amount / 2);
      await prisma.bounty.update({ where: { id: bounty.id }, data: { status: "expired" } });
      await adjustReputation(bounty.offeredById, refund);
      results.push({ bountyId: bounty.id, action: "expired", refund });
    }
  }

  return Response.json({ processed: results.length, results });
}
