import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { questions: true } } },
    orderBy: { questions: { _count: "desc" } },
    take: 100,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-[var(--muted)] text-sm mt-1">Browse topics — tags are created when questions are posted</p>
      </div>

      {tags.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-[var(--muted)]">No tags yet. Ask a question to create the first tag!</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/questions?tag=${tag.name}`}
            className="card p-4 no-underline hover:shadow-md group"
          >
            <span className="tag text-sm font-semibold group-hover:bg-[#c8ddf5] transition-colors">
              {tag.name}
            </span>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--blue)]/30 rounded-full"
                  style={{ width: `${Math.min(100, (tag._count.questions / Math.max(tags[0]?._count.questions || 1, 1)) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-[var(--muted)] tabular-nums shrink-0">
                {tag._count.questions}
              </span>
            </div>
            {tag.description && (
              <p className="text-xs text-[var(--muted)] mt-2 line-clamp-2">{tag.description}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
