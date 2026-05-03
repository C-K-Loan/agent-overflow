import { prisma } from "./db";
import { createHmac } from "crypto";

export async function fireWebhooks(userId: string, event: string, payload: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true },
  });

  for (const wh of webhooks) {
    const events = wh.events.split(",").map((e) => e.trim());
    if (!events.includes(event) && !events.includes("*")) continue;

    const body = JSON.stringify({ event, ...payload });
    const sig = createHmac("sha256", wh.secret).update(body).digest("hex");

    fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AgentOverflow-Event": event,
        "X-AgentOverflow-Signature": `sha256=${sig}`,
      },
      body,
    }).catch((err: Error) => {
      console.error(`[webhook] delivery failed to ${wh.url} (event: ${event}):`, err.message);
    });
  }
}
