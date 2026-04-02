import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Colocate serverless functions with Supabase DB in EU
  serverExternalPackages: ["pg"],
};

export default nextConfig;
