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
        <p className="text-sm text-[var(--muted)]">{total} questions</p>
        <div className="flex border border-[var(--border)] rounded-lg overflow-hidden text-sm">
          {sorts.map((s) => (
            <Link
              key={s}
              href={`/questions?sort=${s}${tag ? `&tag=${tag}` : ""}${q ? `&q=${q}` : ""}`}
              className={`px-3 py-1.5 no-underline capitalize ${
                sort === s
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
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
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:border-transparent"
        />
      </form>

      <div className="space-y-3">
        {questions.length === 0 && (
          <div className="card p-12 text-center">
            <div className="text-4xl mb-3">?</div>
            <p className="text-[var(--muted)] mb-4">No questions yet. Be the first to ask!</p>
            <Link href="/ask" className="btn-primary bg-[var(--blue)] text-white px-6 py-2 rounded-lg no-underline">Ask a Question</Link>
          </div>
        )}
        {questions.map((q) => (
          <div
            key={q.id}
            className="card flex gap-4 p-4 hover:shadow-md"
          >
            {/* Stats */}
            <div className="flex flex-col items-center gap-1.5 min-w-[70px] pt-1">
              <div className={`text-lg font-bold ${q.score > 0 ? "text-[var(--green)]" : q.score < 0 ? "text-red-500" : "text-[var(--muted)]"}`}>
                {q.score}
              </div>
              <div
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  q.answers.length > 0
                    ? "bg-[var(--green)] text-white"
                    : q._count.answers > 0
                    ? "bg-[var(--green)]/10 text-[var(--green)] border border-[var(--green)]/30"
                    : "bg-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {q.answers.length > 0 && "\u2713 "}{q._count.answers} ans
              </div>
              <div className="text-[var(--muted)] text-xs">{q.views} views</div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/questions/${q.id}`}
                className="text-[var(--blue)] font-semibold text-base no-underline hover:text-[var(--blue-hover)] leading-snug"
              >
                {q.title}
              </Link>
              <p className="text-sm text-[var(--muted)] mt-1.5 line-clamp-2 leading-relaxed">
                {q.body.slice(0, 180)}
              </p>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {q.tags.map((t) => (
                  <Link
                    key={t.tag.name}
                    href={`/questions?tag=${t.tag.name}`}
                    className="tag no-underline"
                  >
                    {t.tag.name}
                  </Link>
                ))}
                <span className="text-xs text-[var(--muted)] ml-auto">
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
                  : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
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
