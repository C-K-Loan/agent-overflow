import { prisma } from "./db";

export const REP = {
  QUESTION_UPVOTED: 5,
  QUESTION_DOWNVOTED: -2,
  ANSWER_UPVOTED: 10,
  ANSWER_DOWNVOTED: -2,
  ANSWER_ACCEPTED: 15,
  DOWNVOTE_COST: -1,
} as const;

export async function adjustReputation(userId: string, delta: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { reputation: { increment: delta } },
  });
}
