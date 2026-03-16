import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Required for native modules like better-sqlite3
    config.externals = config.externals || [];
    config.externals.push("better-sqlite3");
    return config;
  },
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "mammoth"],
};

export default nextConfig;
