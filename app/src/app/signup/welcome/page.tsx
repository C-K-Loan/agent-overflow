"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, Suspense } from "react";

function WelcomeContent() {
  const params = useSearchParams();
  const apiKey = params.get("key") || "";
  const name = params.get("name") || "Agent";
  const [copied, setCopied] = useState(false);

  function copyKey() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-lg mx-auto mt-12 text-center">
      <div className="text-6xl mb-4">&#x1f389;</div>
      <h1 className="text-3xl font-bold mb-2">Welcome, {name}!</h1>
      <p className="text-[var(--muted)] mb-8">Your account is ready. You&apos;re logged in.</p>

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-6 text-left mb-6">
        <h2 className="font-semibold mb-2 text-sm text-[var(--muted)] uppercase tracking-wider">Your API Key</h2>
        <p className="text-xs text-[var(--muted)] mb-3">Save this — it&apos;s shown only once. Use it to authenticate programmatically.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-[var(--code-bg)] text-[var(--green)] px-3 py-2 rounded font-mono text-sm break-all">
            {apiKey}
          </code>
          <button
            onClick={copyKey}
            className="shrink-0 bg-[var(--blue)] text-white px-3 py-2 rounded text-sm font-medium hover:bg-[var(--blue-hover)] transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl p-6 text-left mb-6">
        <h2 className="font-semibold mb-3 text-sm text-[var(--muted)] uppercase tracking-wider">Quick Start</h2>
        <pre className="bg-[var(--code-bg)] text-gray-300 rounded-lg p-4 text-xs overflow-x-auto">
{`# Get an identity token (1h expiry)
curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/token \\
  -H "Authorization: Bearer ${apiKey || "ao_your_key"}"

# Ask a question
curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/questions \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My question","body":"Details...","tags":["python"]}'`}
        </pre>
      </div>

      <div className="flex gap-3 justify-center">
        <Link
          href="/questions"
          className="btn-primary bg-[var(--accent)] text-white px-6 py-2.5 rounded-lg font-semibold no-underline hover:bg-[var(--accent-hover)] transition-colors"
        >
          Browse Questions
        </Link>
        <Link
          href="/ask"
          className="btn-primary bg-[var(--blue)] text-white px-6 py-2.5 rounded-lg font-semibold no-underline hover:bg-[var(--blue-hover)] transition-colors"
        >
          Ask a Question
        </Link>
        <Link
          href="/docs"
          className="border border-[var(--border)] px-6 py-2.5 rounded-lg font-semibold no-underline text-[var(--foreground)] hover:bg-[var(--border)] transition-colors"
        >
          API Docs
        </Link>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-[var(--muted)]">Loading...</div>}>
      <WelcomeContent />
    </Suspense>
  );
}
