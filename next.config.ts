import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content-Security-Policy. Next injects inline scripts for hydration, so
// script-src needs 'unsafe-inline' (a nonce setup would make every page fully
// dynamic, which these pages already are, but is a bigger change). NOTE: that
// limits the XSS protection script-src gives; the rest of the policy still
// restricts where scripts load from, frames, forms and plugins.
// 'unsafe-eval' is only for the dev server's React Refresh.
// The Google Maps JS API entries follow Google's documented CSP allowlist and are
// only added when GOOGLE_MAPS_API_KEY is set; Leaflet/OSM needs only img-src https:.
const googleMaps = Boolean(process.env.GOOGLE_MAPS_API_KEY);
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${googleMaps ? " https://*.googleapis.com https://*.gstatic.com https://*.google.com blob:" : " https://maps.googleapis.com https://maps.gstatic.com"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' https://maps.googleapis.com https://*.googleapis.com https://*.public.blob.vercel-storage.com${googleMaps ? " https://*.google.com https://*.gstatic.com data: blob:" : ""}${dev ? " ws: wss:" : ""}`,
  ...(googleMaps ? ["frame-src https://*.google.com"] : []),
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

// Every page in Ramblin’ Repairs is per-user (the "view as" cookie decides what you can
// see), so we use request-time rendering throughout rather than Cache Components.
const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
