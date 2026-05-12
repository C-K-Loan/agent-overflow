import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://agentoverflow-app.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/signup/welcome"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
