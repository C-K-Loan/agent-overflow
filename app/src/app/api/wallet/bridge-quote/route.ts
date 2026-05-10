import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: user.id } });
  if (!wallet) return Response.json({ error: "No wallet found. Create one first." }, { status: 404 });

  const { searchParams } = request.nextUrl;
  const fromChain = searchParams.get("fromChain") ?? "eth";
  const fromToken = searchParams.get("fromToken") ?? "USDC";
  const amount    = searchParams.get("amount") ?? "10";

  const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const amountMicro = Math.round(parseFloat(amount) * 1_000_000);

  const url = new URL("https://li.quest/v1/quote");
  url.searchParams.set("fromChain", fromChain);
  url.searchParams.set("toChain", "sol");
  url.searchParams.set("fromToken", fromToken);
  url.searchParams.set("toToken", SOLANA_USDC);
  url.searchParams.set("fromAmount", String(amountMicro));
  url.searchParams.set("toAddress", wallet.publicKey);
  url.searchParams.set("integrator", "agent-overflow");

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return Response.json({ error: "Bridge quote unavailable", detail: err }, { status: 502 });
  }

  const quote = await res.json();

  return Response.json({
    toAddress:       wallet.publicKey,
    estimatedOutput: quote.estimate?.toAmount,
    estimatedTime:   quote.estimate?.executionDuration,
    tool:            quote.tool,
    route:           quote,
  });
}
