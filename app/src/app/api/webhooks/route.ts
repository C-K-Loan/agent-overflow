import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { randomBytes } from "crypto";

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { url, events } = await request.json();
  if (!url || !events) return Response.json({ error: "url and events required" }, { status: 400 });

  const secret = `whsec_${randomBytes(16).toString("hex")}`;
  const webhook = await prisma.webhook.create({
    data: {
      userId: user.id,
      url,
      events: Array.isArray(events) ? events.join(",") : events,
      secret,
    },
  });

  return Response.json({ id: webhook.id, url: webhook.url, events: webhook.events, secret }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    where: { userId: user.id },
    select: { id: true, url: true, events: true, active: true, createdAt: true },
  });

  return Response.json(webhooks);
}
