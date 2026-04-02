import { NextResponse, type NextRequest } from "next/server";

const rateLimits = new Map<string, { count: number; resetAt: number }>();

const LIMITS = {
  mutation: { max: 30, windowMs: 60_000 },
  read: { max: 120, windowMs: 60_000 },
};

function getKey(request: NextRequest): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return `key:${auth.slice(7, 20)}`;
  return `ip:${request.headers.get("x-forwarded-for") || "unknown"}`;
}

function isMutation(method: string): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method);
}

export function middleware(request: NextRequest) {
  // Only rate-limit API routes
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const key = getKey(request);
  const limit = isMutation(request.method) ? LIMITS.mutation : LIMITS.read;
  const now = Date.now();

  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + limit.windowMs });
    return NextResponse.next();
  }

  entry.count++;
  if (entry.count > limit.max) {
    return Response.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
          "X-RateLimit-Limit": String(limit.max),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(limit.max));
  res.headers.set("X-RateLimit-Remaining", String(limit.max - entry.count));
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
