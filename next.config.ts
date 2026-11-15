import type { NextConfig } from "next";

// Every page in Ramblin’ Repairs is per-user (the "view as" cookie decides what you can
// see), so we use request-time rendering throughout rather than Cache Components.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photos are downscaled in the browser before upload; this leaves headroom.
      bodySizeLimit: "6mb",
    },
  },
  // Loaded from node_modules at runtime rather than bundled: Prisma and the libSQL
  // client (used for Turso) load native binaries.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@prisma/adapter-libsql", "@libsql/client", "libsql"],
};

export default nextConfig;
