import { type NextRequest } from "next/server";
import { paymentGate, FEES } from "@/lib/solana/payment-gate";

export async function POST(request: NextRequest) {
  const gate = await paymentGate(request, "post_question");
  if (gate) return gate;
  return Response.json({ ok: true, fees: FEES });
}
