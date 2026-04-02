import { prisma } from "./db";
import { createNotification } from "./notify";

const BADGE_DEFS = [
  // Bronze
  { name: "First Question", description: "Asked your first question", tier: "bronze", check: "questions", threshold: 1 },
  { name: "First Answer", description: "Posted your first answer", tier: "bronze", check: "answers", threshold: 1 },
  { name: "Supporter", description: "Cast your first upvote", tier: "bronze", check: "votes", threshold: 1 },
  { name: "Student", description: "Asked a question with score of 1 or more", tier: "bronze", check: "questionScore", threshold: 1 },
  { name: "Teacher", description: "Answered a question with score of 1 or more", tier: "bronze", check: "answerScore", threshold: 1 },
  // Silver
  { name: "Curious", description: "Asked 5 questions", tier: "silver", check: "questions", threshold: 5 },
  { name: "Contributor", description: "Posted 10 answers", tier: "silver", check: "answers", threshold: 10 },
  { name: "Civic Duty", description: "Cast 50 votes", tier: "silver", check: "votes", threshold: 50 },
  { name: "Nice Answer", description: "Answer with score of 10 or more", tier: "silver", check: "answerScore", threshold: 10 },
  { name: "Nice Question", description: "Question with score of 10 or more", tier: "silver", check: "questionScore", threshold: 10 },
  { name: "Benefactor", description: "Offered 3 bounties", tier: "silver", check: "bountiesOffered", threshold: 3 },
  // Gold
  { name: "Great Answer", description: "Answer with score of 25 or more", tier: "gold", check: "answerScore", threshold: 25 },
  { name: "Great Question", description: "Question with score of 25 or more", tier: "gold", check: "questionScore", threshold: 25 },
  { name: "Fanatic", description: "Asked 25 questions", tier: "gold", check: "questions", threshold: 25 },
  { name: "Guru", description: "Posted 50 answers", tier: "gold", check: "answers", threshold: 50 },
  { name: "Bounty Hunter", description: "Won 5 bounties", tier: "gold", check: "bountiesWon", threshold: 5 },
];

export async function ensureBadgesExist() {
  for (const def of BADGE_DEFS) {
    await prisma.badge.upsert({
      where: { name: def.name },
      create: { name: def.name, description: def.description, tier: def.tier },
      update: {},
    });
  }
}

export async function checkAndAwardBadges(userId: string) {
  const badges = await prisma.badge.findMany();
  const existing = await prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true } });
  const existingIds = new Set(existing.map((b) => b.badgeId));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { questions: true, answers: true, votes: true } },
    },
  });
  if (!user) return;

  const counts: Record<string, number> = {
    questions: user._count.questions,
    answers: user._count.answers,
    votes: user._count.votes,
  };

  // Get max scores
  const maxAnswerScore = await prisma.answer.aggregate({ where: { authorId: userId }, _max: { score: true } });
  const maxQuestionScore = await prisma.question.aggregate({ where: { authorId: userId }, _max: { score: true } });
  counts.answerScore = maxAnswerScore._max.score || 0;
  counts.questionScore = maxQuestionScore._max.score || 0;

  const bountiesOffered = await prisma.bounty.count({ where: { offeredById: userId } });
  const bountiesWon = await prisma.bounty.count({ where: { awardedToId: userId, status: "awarded" } });
  counts.bountiesOffered = bountiesOffered;
  counts.bountiesWon = bountiesWon;

  for (const def of BADGE_DEFS) {
    const badge = badges.find((b) => b.name === def.name);
    if (!badge || existingIds.has(badge.id)) continue;

    if ((counts[def.check] || 0) >= def.threshold) {
      await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
      await createNotification(userId, "badge_earned", { badge: def.name, tier: def.tier });
    }
  }
}
