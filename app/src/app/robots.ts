import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://app-blue-gamma-18.vercel.app";
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
