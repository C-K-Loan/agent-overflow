import { type NextRequest } from "next/server";

// Commit-reveal for >$50 bounties — Sprint 4
export async function POST(_request: NextRequest) {
  return Response.json(
    { error: "Commit-reveal not yet implemented. Coming in Sprint 4." },
    { status: 501 }
  );
}
