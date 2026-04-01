import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, score: true, createdAt: true, _count: { select: { answers: true } } },
      },
      answers: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          question: { select: { id: true, title: true } },
        },
      },
      _count: { select: { questions: true, answers: true } },
    },
  });

  if (!user) notFound();

  return (
    <div>
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className={`w-16 h-16 rounded-lg flex items-center justify-center text-white font-bold text-2xl ${
            user.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
          }`}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
          <div className="flex gap-4 text-sm text-gray-500 mt-1">
            <span className="capitalize">{user.type}</span>
            <span className="font-semibold text-[var(--foreground)]">{user.reputation} reputation</span>
            <span>Joined {timeAgo(user.createdAt)}</span>
          </div>
          {user.bio && <p className="text-sm text-gray-600 mt-2">{user.bio}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="border border-[var(--border)] rounded p-3 bg-white text-center">
          <div className="text-2xl font-bold">{user.reputation}</div>
          <div className="text-xs text-gray-500">reputation</div>
        </div>
        <div className="border border-[var(--border)] rounded p-3 bg-white text-center">
          <div className="text-2xl font-bold">{user._count.questions}</div>
          <div className="text-xs text-gray-500">questions</div>
        </div>
        <div className="border border-[var(--border)] rounded p-3 bg-white text-center">
          <div className="text-2xl font-bold">{user._count.answers}</div>
          <div className="text-xs text-gray-500">answers</div>
        </div>
        <div className="border border-[var(--border)] rounded p-3 bg-white text-center">
          <div className="text-2xl font-bold">{user.answers.filter((a) => a.isAccepted).length}</div>
          <div className="text-xs text-gray-500">accepted</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Questions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Questions</h2>
          {user.questions.length === 0 && <p className="text-sm text-gray-500">No questions yet.</p>}
          <div className="space-y-2">
            {user.questions.map((q) => (
              <div key={q.id} className="flex items-center gap-3 text-sm">
                <span className={`min-w-[32px] text-center rounded px-1 py-0.5 text-xs ${
                  q.score > 0 ? "bg-[var(--green)] text-white" : "border border-[var(--border)] text-gray-500"
                }`}>
                  {q.score}
                </span>
                <Link href={`/questions/${q.id}`} className="no-underline text-[var(--blue)] truncate">
                  {q.title}
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Answers */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Answers</h2>
          {user.answers.length === 0 && <p className="text-sm text-gray-500">No answers yet.</p>}
          <div className="space-y-2">
            {user.answers.map((a) => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <span className={`min-w-[32px] text-center rounded px-1 py-0.5 text-xs ${
                  a.isAccepted ? "bg-[var(--green)] text-white" : a.score > 0 ? "bg-gray-100 text-gray-700" : "border border-[var(--border)] text-gray-500"
                }`}>
                  {a.isAccepted ? "\u2713" : a.score}
                </span>
                <Link href={`/questions/${a.question.id}`} className="no-underline text-[var(--blue)] truncate">
                  {a.question.title}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
