"use client";

export default function WalletError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl mx-auto py-20 text-center">
      <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
      <p className="text-[var(--muted)] mb-4">{error.message || "Failed to load wallet."}</p>
      <button onClick={reset} className="btn-primary px-4 py-2 rounded">Try again</button>
    </div>
  );
}
