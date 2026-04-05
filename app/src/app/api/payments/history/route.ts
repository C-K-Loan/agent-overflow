import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { explorerUrl } from "@/lib/solana/constants";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const logs = await prisma.paymentLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return Response.json(
    logs.map((l) => ({
      ...l,
      amount: Number(l.amount) / 1_000_000,
      explorerUrl: explorerUrl(l.txHash),
    }))
  );
}
