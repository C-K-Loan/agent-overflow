export const dynamic = "force-dynamic";
export const revalidate = 60; // cache 60s

export async function GET() {
  try {
    // Try Birdeye first if API key is set
    const birdeyeKey = process.env.BIRDEYE_API_KEY;
    if (birdeyeKey) {
      try {
        const res = await fetch(
          "https://public-api.birdeye.so/public/multi_price?list_address=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,So11111111111111111111111111111111111111112",
          { headers: { "X-API-KEY": birdeyeKey }, next: { revalidate: 60 } }
        );
        if (res.ok) {
          const data = await res.json();
          const items = data?.data ?? {};
          const usdc = items["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]?.value ?? 1.0;
          const sol = items["So11111111111111111111111111111111111111112"]?.value ?? 150.0;
          return Response.json({ usdc, sol, source: "birdeye" });
        }
      } catch {
        // fall through to CoinGecko
      }
    }

    // Fallback: CoinGecko (free, no key needed)
    const cg = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,solana&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    const cgData = await cg.json();
    return Response.json({
      usdc: cgData["usd-coin"]?.usd ?? 1.0,
      sol: cgData["solana"]?.usd ?? 150.0,
      source: "coingecko",
    });
  } catch {
    return Response.json({ usdc: 1.0, sol: 150.0, source: "fallback" });
  }
}
