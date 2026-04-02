import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; q?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const sort = params.sort || "newest";
  const q = params.q || "";
  const tag = params.tag || "";
  const limit = 20;

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [{ title: { contains: q } }, { body: { contains: q } }];
  }
  if (tag) {
    where.tags = { some: { tag: { name: tag } } };
  }

  const orderBy =
    sort === "votes"
      ? { score: "desc" as const }
      : sort === "active"
        ? { updatedAt: "desc" as const }
        : { createdAt: "desc" as const };

  const extraWhere = sort === "unanswered" ? { answers: { none: {} } } : {};

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where: { ...where, ...extraWhere },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true, reputation: true, type: true } },
        tags: { include: { tag: true } },
        _count: { select: { answers: true } },
        answers: { where: { isAccepted: true }, select: { id: true }, take: 1 },
      },
    }),
    prisma.question.count({ where: { ...where, ...extraWhere } }),
  ]);

  const pages = Math.ceil(total / limit);
  const sorts = ["newest", "active", "votes", "unanswered"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">
          {tag ? `Questions tagged [${tag}]` : q ? `Search: ${q}` : "All Questions"}
        </h1>
        <Link
          href="/ask"
          className="btn-primary bg-[var(--blue)] text-white px-4 py-2 rounded text-sm font-medium no-underline hover:bg-[var(--blue-hover)]"
        >
          Ask Question
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">{total} questions</p>
        <div className="flex border border-[var(--border)] rounded overflow-hidden text-sm">
          {sorts.map((s) => (
            <Link
              key={s}
              href={`/questions?sort=${s}${tag ? `&tag=${tag}` : ""}${q ? `&q=${q}` : ""}`}
              className={`px-3 py-1.5 no-underline capitalize ${
                sort === s
                  ? "bg-[var(--foreground)] text-white"
                  : "text-[var(--foreground)] hover:bg-gray-100"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Search */}
      <form className="mb-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search questions..."
          className="w-full border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:border-transparent"
        />
      </form>

      <div className="border-t border-[var(--border)]">
        {questions.length === 0 && (
          <p className="py-8 text-center text-gray-500">No questions yet. Be the first to ask!</p>
        )}
        {questions.map((q) => (
          <div
            key={q.id}
            className="flex gap-4 py-4 border-b border-[var(--border)]"
          >
            {/* Stats */}
            <div className="flex flex-col items-end gap-1 min-w-[80px] text-sm">
              <span className={`font-medium ${q.score > 0 ? "text-[var(--green)]" : q.score < 0 ? "text-red-600" : "text-gray-500"}`}>
                {q.score} votes
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs ${
                  q.answers.length > 0
                    ? "bg-[var(--green)] text-white border border-[var(--green)]"
                    : q._count.answers > 0
                    ? "bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]"
                    : "border border-[var(--border)] text-gray-500"
                }`}
              >
                {q.answers.length > 0 && "\u2713 "}{q._count.answers} answers
              </span>
              <span className="text-gray-400 text-xs">{q.views} views</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/questions/${q.id}`}
                className="text-[var(--blue)] font-medium text-base no-underline hover:text-[var(--blue-hover)]"
              >
                {q.title}
              </Link>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                {q.body.slice(0, 200)}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {q.tags.map((t) => (
                  <Link
                    key={t.tag.name}
                    href={`/questions?tag=${t.tag.name}`}
                    className="bg-[#e1ecf4] text-[#39739d] px-2 py-0.5 rounded text-xs no-underline hover:bg-[#d0e3f1]"
                  >
                    {t.tag.name}
                  </Link>
                ))}
                <span className="text-xs text-gray-400 ml-auto">
                  <span className={`font-medium ${q.author.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"}`}>
                    {q.author.name}
                  </span>
                  {" "}{q.author.reputation} rep &middot; {timeAgo(q.createdAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex gap-2 mt-4">
          {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/questions?page=${p}&sort=${sort}${tag ? `&tag=${tag}` : ""}${q ? `&q=${params.q}` : ""}`}
              className={`px-3 py-1 rounded text-sm no-underline ${
                p === page
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--border)] text-[var(--foreground)] hover:bg-gray-100"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
