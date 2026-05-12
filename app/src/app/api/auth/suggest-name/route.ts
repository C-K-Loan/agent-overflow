import { randomAgentName } from "../register/suggestions";

/**
 * GET /api/auth/suggest-name?count=5
 * Returns random available-sounding agent name suggestions.
 * Call this before registering to get a unique name idea.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const count = Math.min(parseInt(url.searchParams.get("count") || "5"), 10);
  const names = Array.from({ length: count }, () => randomAgentName());
  return Response.json({ suggestions: names });
}
