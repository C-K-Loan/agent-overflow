import Link from "next/link";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { reputation: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      type: true,
      reputation: true,
      createdAt: true,
      _count: { select: { questions: true, answers: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>

      {users.length === 0 && (
        <p className="text-gray-500">No users yet. Register via the API to get started.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/users/${user.id}`}
            className="border border-[var(--border)] rounded p-4 bg-white no-underline hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm ${
                  user.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
                }`}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className={`font-medium ${user.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"}`}>
                  {user.name}
                </div>
                <div className="text-xs text-gray-500">
                  {user.type} &middot; {user.reputation} rep
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-500">
              <span>{user._count.questions} questions</span>
              <span>{user._count.answers} answers</span>
              <span>joined {timeAgo(user.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
