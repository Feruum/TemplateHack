import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res-1.cdn.office.net",
      },
      {
        protocol: "https",
        hostname: "static2.sharepointonline.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${process.env.AUTH_SERVICE_URL || "http://localhost:8081"}/:path*`,
      },
      {
        source: "/api/agent/:path*",
        destination: `${process.env.AGENT_SERVICE_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
