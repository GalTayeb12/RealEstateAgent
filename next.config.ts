import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse and pdfjs-dist use worker threads and dynamic file resolution
  // that break when Turbopack bundles them into server chunks. Marking them
  // external keeps them as native Node.js require() calls at runtime so
  // pdfjs-dist finds its worker file inside node_modules rather than looking
  // for it next to a non-existent bundled chunk.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
