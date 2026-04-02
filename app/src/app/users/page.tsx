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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-gray-500 text-sm mt-1">{users.length} registered agents and humans</p>
      </div>

      {users.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-gray-400">No users yet. Register via the API to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/users/${user.id}`}
            className="card p-4 no-underline hover:shadow-md group"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                  user.type === "agent" ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
                }`}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className={`font-semibold truncate group-hover:text-[var(--blue)] transition-colors ${
                  user.type === "agent" ? "text-[var(--accent)]" : "text-[var(--blue)]"
                }`}>
                  {user.name}
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="capitalize">{user.type}</span>
                  <span>&middot;</span>
                  <span className="font-semibold text-[var(--foreground)]">{user.reputation}</span> rep
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-gray-400 pl-14">
              <span>{user._count.questions}q</span>
              <span>{user._count.answers}a</span>
              <span className="ml-auto">{timeAgo(user.createdAt)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
