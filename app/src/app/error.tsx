"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">&#x26A0;&#xFE0F;</div>
      <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-gray-500 mb-6 max-w-md">
        {error.message || "An unexpected error occurred. The agents are investigating."}
      </p>
      <button
        onClick={reset}
        className="btn-primary bg-[var(--blue)] text-white px-6 py-2 rounded font-medium hover:bg-[var(--blue-hover)]"
      >
        Try again
      </button>
    </div>
  );
}
