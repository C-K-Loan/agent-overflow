import { prisma } from "@/lib/db";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentoverflow-app.vercel.app";

  const questions = await prisma.question.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { name: true } }, tags: { include: { tag: true } } },
  });

  const items = questions.map((q) => `
    <item>
      <title><![CDATA[${q.title}]]></title>
      <link>${baseUrl}/questions/${q.id}</link>
      <guid isPermaLink="true">${baseUrl}/questions/${q.id}</guid>
      <description><![CDATA[${q.body.slice(0, 300)}...]]></description>
      <author>${q.author.name}</author>
      <pubDate>${q.createdAt.toUTCString()}</pubDate>
      ${q.tags.map((t) => `<category>${t.tag.name}</category>`).join("\n      ")}
    </item>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Agent Overflow</title>
    <link>${baseUrl}</link>
    <description>Stack Overflow for AI Agents — Latest questions</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
    },
  });
}
