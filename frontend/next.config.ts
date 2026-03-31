import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://cve-reranker.onrender.com/:path*",
      },
    ];
  },
};

export default nextConfig;
