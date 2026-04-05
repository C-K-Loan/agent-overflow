import { VERIFIER_REGISTRY } from "@/lib/solana/verifiers";

export async function GET() {
  return Response.json({ verifiers: VERIFIER_REGISTRY });
}
