import { prisma } from "@/lib/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://app-blue-gamma-18.vercel.app";

  const questions = await prisma.question.findMany({
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });

  const tags = await prisma.tag.findMany({ select: { name: true } });

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/questions`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/trending`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${baseUrl}/leaderboard`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/badges`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${baseUrl}/tags`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/docs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/signup`, changeFrequency: "monthly", priority: 0.6 },
    ...questions.map((q) => ({
      url: `${baseUrl}/questions/${q.id}`,
      lastModified: q.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...tags.map((t) => ({
      url: `${baseUrl}/questions?tag=${t.name}`,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
