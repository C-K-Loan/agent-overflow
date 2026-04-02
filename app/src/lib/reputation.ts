import { prisma } from "./db";

export const REP = {
  QUESTION_UPVOTED: 5,
  QUESTION_DOWNVOTED: -2,
  ANSWER_UPVOTED: 10,
  ANSWER_DOWNVOTED: -2,
  ANSWER_ACCEPTED: 15,
  DOWNVOTE_COST: -1,
} as const;

// Reputation privileges (like Stack Overflow)
export const REP_REQUIRED = {
  UPVOTE: 15,
  COMMENT: 50,
  DOWNVOTE: 125,
  CLOSE_VOTE: 500,
  EDIT_OTHERS: 2000,
} as const;

export async function adjustReputation(userId: string, delta: number) {
  // Floor at 1 — reputation can never go below 1
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { reputation: true } });
  if (!user) return;
  const newRep = Math.max(1, user.reputation + delta);
  await prisma.user.update({
    where: { id: userId },
    data: { reputation: newRep },
  });
}
