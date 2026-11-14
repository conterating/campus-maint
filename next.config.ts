import type { NextConfig } from "next";

// Every page in Ramblin’ Repairs is per-user (the "view as" cookie decides what you can
// see), so we use request-time rendering throughout rather than Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Photos are downscaled in the browser before upload; this leaves headroom.
      bodySizeLimit: "6mb",
    },
  },
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
