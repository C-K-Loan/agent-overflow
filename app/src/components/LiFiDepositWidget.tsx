"use client";

import { LiFiWidget, type WidgetConfig, ChainType } from "@lifi/widget";

const SOLANA_USDC     = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_CHAIN_ID = 1151111081099710;

export function LiFiDepositWidget({ walletAddress }: { walletAddress: string }) {
  const config: WidgetConfig = {
    toChain:    SOLANA_CHAIN_ID,
    toToken:    SOLANA_USDC,
    toAddress:  { address: walletAddress, chainType: ChainType.SVM },
    variant:    "compact",
    appearance: "dark",
    theme: {
      palette: {
        primary:    { main: "#F48225" },
        background: { default: "#0a0a0a", paper: "#111111" },
      },
    },
    hiddenUI:   ["history", "poweredBy"],
    integrator: "agent-overflow",
  };

  return <LiFiWidget {...config} />;
}
