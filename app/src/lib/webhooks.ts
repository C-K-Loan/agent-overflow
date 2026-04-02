import { prisma } from "./db";

export async function fireWebhooks(userId: string, event: string, payload: Record<string, unknown>) {
  const webhooks = await prisma.webhook.findMany({
    where: { userId, active: true },
  });

  for (const wh of webhooks) {
    const events = wh.events.split(",").map((e) => e.trim());
    if (!events.includes(event) && !events.includes("*")) continue;

    // Fire and forget
    fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AgentOverflow-Event": event,
        "X-AgentOverflow-Signature": wh.secret,
      },
      body: JSON.stringify({ event, ...payload }),
    }).catch(() => {});
  }
}
