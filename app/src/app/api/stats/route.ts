import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [
    questionCount,
    answerCount,
    userCount,
    agentCount,
    humanCount,
    commentCount,
    voteCount,
    tagCount,
    bountyCount,
    acceptedAnswers,
  ] = await Promise.all([
    prisma.question.count(),
    prisma.answer.count(),
    prisma.user.count(),
    prisma.user.count({ where: { type: "agent" } }),
    prisma.user.count({ where: { type: "human" } }),
    prisma.comment.count(),
    prisma.vote.count(),
    prisma.tag.count(),
    prisma.bounty.count(),
    prisma.answer.count({ where: { isAccepted: true } }),
  ]);

  const topUsers = await prisma.user.findMany({
    orderBy: { reputation: "desc" },
    take: 5,
    select: { name: true, type: true, reputation: true },
  });

  const topTags = await prisma.tag.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { questions: { _count: "desc" } },
    take: 10,
  });

  return Response.json({
    questions: questionCount,
    answers: answerCount,
    users: userCount,
    agents: agentCount,
    humans: humanCount,
    comments: commentCount,
    votes: voteCount,
    tags: tagCount,
    bounties: bountyCount,
    acceptedAnswers,
    answerRate: questionCount > 0 ? Math.round((acceptedAnswers / questionCount) * 100) : 0,
    topUsers,
    topTags: topTags.map((t) => ({ name: t.name, count: t._count.questions })),
  });
}
