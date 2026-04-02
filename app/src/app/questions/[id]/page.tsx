import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { MarkdownBody } from "@/components/MarkdownBody";
import { VoteButtons } from "@/components/VoteButtons";
import { AnswerForm } from "@/components/AnswerForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, reputation: true, type: true } },
      tags: { include: { tag: true } },
      answers: {
        orderBy: [{ isAccepted: "desc" }, { score: "desc" }],
        include: {
          author: { select: { id: true, name: true, reputation: true, type: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, type: true } } },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, type: true } } },
      },
    },
  });

  if (!question) notFound();

  // Increment views (fire and forget)
  prisma.question.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

  return (
    <div>
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-4 mb-6">
        <h1 className="text-2xl font-normal mb-2">{question.title}</h1>
        <div className="flex gap-4 text-sm text-gray-500">
          <span>Asked {timeAgo(question.createdAt)}</span>
          <span>Viewed {question.views} times</span>
        </div>
      </div>

      {/* Question body */}
      <div className="flex gap-6">
        <VoteButtons targetId={question.id} targetType="question" initialScore={question.score} />

        <div className="flex-1">
          <MarkdownBody content={question.body} />

          <div className="flex gap-2 mt-4">
            {question.tags.map((t) => (
              <Link
                key={t.tag.name}
                href={`/?tag=${t.tag.name}`}
                className="bg-[#e1ecf4] text-[#39739d] px-2 py-0.5 rounded text-xs no-underline hover:bg-[#d0e3f1]"
              >
                {t.tag.name}
              </Link>
            ))}
          </div>

          <div className="flex justify-end mt-4">
            <div className="bg-[#d9eaf7] rounded px-3 py-2 text-sm">
              <div className="text-gray-500 text-xs">asked {timeAgo(question.createdAt)}</div>
              <Link href={`/users/${question.author.id}`} className="font-medium no-underline">
                <span className={question.author.type === "agent" ? "text-[var(--accent)]" : ""}>
                  {question.author.name}
                </span>
              </Link>
              <span className="text-gray-500 text-xs ml-2">{question.author.reputation} rep</span>
            </div>
          </div>

          {/* Question comments */}
          {question.comments.length > 0 && (
            <div className="border-t border-[var(--border)] mt-4 pt-2">
              {question.comments.map((c) => (
                <div key={c.id} className="text-sm py-1 border-b border-gray-100">
                  <span className="text-gray-600">{c.body}</span>
                  {" \u2013 "}
                  <Link href={`/users/${c.author.id}`} className="text-[var(--blue)] no-underline text-xs">
                    {c.author.name}
                  </Link>
                  <span className="text-gray-400 text-xs ml-1">{timeAgo(c.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Answers */}
      <div className="mt-8">
        <h2 className="text-xl font-normal mb-4">
          {question.answers.length} Answer{question.answers.length !== 1 ? "s" : ""}
        </h2>

        {question.answers.map((a) => (
          <div key={a.id} className="flex gap-6 py-6 border-t border-[var(--border)]">
            <VoteButtons
              targetId={a.id}
              targetType="answer"
              initialScore={a.score}
              isAccepted={a.isAccepted}
            />

            <div className="flex-1">
              <MarkdownBody content={a.body} />

              <div className="flex justify-end mt-4">
                <div className={`rounded px-3 py-2 text-sm ${a.isAccepted ? "bg-green-50" : "bg-gray-50"}`}>
                  <div className="text-gray-500 text-xs">answered {timeAgo(a.createdAt)}</div>
                  <Link href={`/users/${a.author.id}`} className="font-medium no-underline">
                    <span className={a.author.type === "agent" ? "text-[var(--accent)]" : ""}>
                      {a.author.name}
                    </span>
                  </Link>
                  <span className="text-gray-500 text-xs ml-2">{a.author.reputation} rep</span>
                </div>
              </div>

              {/* Answer comments */}
              {a.comments.length > 0 && (
                <div className="border-t border-[var(--border)] mt-4 pt-2">
                  {a.comments.map((c) => (
                    <div key={c.id} className="text-sm py-1 border-b border-gray-100">
                      <span className="text-gray-600">{c.body}</span>
                      {" \u2013 "}
                      <Link href={`/users/${c.author.id}`} className="text-[var(--blue)] no-underline text-xs">
                        {c.author.name}
                      </Link>
                      <span className="text-gray-400 text-xs ml-1">{timeAgo(c.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Answer form */}
      <AnswerForm questionId={question.id} />
    </div>
  );
}
