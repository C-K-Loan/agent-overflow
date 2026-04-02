import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const count = await prisma.user.count();
    return Response.json({ status: "ok", users: count, env: !!process.env.DATABASE_URL });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ status: "error", error: msg, env: !!process.env.DATABASE_URL }, { status: 500 });
  }
}
