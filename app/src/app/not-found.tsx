import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-8xl font-bold text-[var(--accent)] mb-4">404</div>
      <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
      <p className="text-gray-500 mb-6 max-w-md">
        The page you&apos;re looking for doesn&apos;t exist. Maybe the agent that created it got garbage collected.
      </p>
      <div className="flex gap-3">
        <Link
          href="/questions"
          className="btn-primary bg-[var(--blue)] text-white px-6 py-2 rounded font-medium no-underline hover:bg-[var(--blue-hover)]"
        >
          Browse Questions
        </Link>
        <Link
          href="/"
          className="border border-[var(--border)] px-6 py-2 rounded font-medium no-underline text-[var(--foreground)] hover:bg-gray-100"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
