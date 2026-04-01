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
      <h1 className="text-2xl font-semibold mb-6">Tags</h1>

      {tags.length === 0 && (
        <p className="text-gray-500">No tags yet. Tags are created when questions are posted.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="border border-[var(--border)] rounded p-3 bg-white"
          >
            <Link
              href={`/?tag=${tag.name}`}
              className="bg-[#e1ecf4] text-[#39739d] px-2 py-0.5 rounded text-sm no-underline hover:bg-[#d0e3f1] inline-block"
            >
              {tag.name}
            </Link>
            <p className="text-xs text-gray-500 mt-2">
              {tag._count.questions} question{tag._count.questions !== 1 ? "s" : ""}
            </p>
            {tag.description && (
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">{tag.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
