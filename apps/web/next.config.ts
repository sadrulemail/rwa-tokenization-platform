import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The Docker build sets NEXT_OUTPUT=standalone: server.js plus only the files it needs.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Trace workspace packages from the monorepo root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: {
    root: path.join(__dirname, "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
