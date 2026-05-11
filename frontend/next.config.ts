import type { NextConfig } from "next";

/** Dev: proxy browser calls to FastAPI so requests stay same-origin (no CORS). SSR uses API_INTERNAL_URL / 127.0.0.1:8000 directly in api.ts. */
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` },
      { source: "/uploads/:path*", destination: `${apiProxyTarget}/uploads/:path*` },
      { source: "/health/ready", destination: `${apiProxyTarget}/health/ready` },
      { source: "/health", destination: `${apiProxyTarget}/health` },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "fastly.picsum.photos",
        pathname: "/**",
      },
      { protocol: "http", hostname: "localhost", pathname: "/uploads/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/uploads/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "8000", pathname: "/uploads/**" },
    ],
  },
};

export default nextConfig;
