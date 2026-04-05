import { PLATFORM_FEE_BPS, BPS_DENOMINATOR } from "./constants";

/** Calculate platform fee and payout from bounty amount (all in native units) */
export function calculateFee(amount: bigint): { fee: bigint; payout: bigint } {
  const fee = amount * BigInt(PLATFORM_FEE_BPS) / BigInt(BPS_DENOMINATOR);
  const payout = amount - fee;
  return { fee, payout };
}
