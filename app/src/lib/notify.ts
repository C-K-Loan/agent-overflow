import { prisma } from "./db";

export async function createNotification(
  userId: string,
  type: string,
  data: Record<string, unknown>
) {
  // Don't notify yourself
  await prisma.notification.create({
    data: { userId, type, data: JSON.stringify(data) },
  });
}

export async function notifyQuestionAuthor(
  questionId: string,
  type: string,
  data: Record<string, unknown>,
  excludeUserId?: string
) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { authorId: true },
  });
  if (question && question.authorId !== excludeUserId) {
    await createNotification(question.authorId, type, data);
  }
}
