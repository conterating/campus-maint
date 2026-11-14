import "server-only";
import QRCode from "qrcode";
import { headers } from "next/headers";

/** Base URL encoded into QR codes: PUBLIC_BASE_URL if set, otherwise the request's host. */
export async function publicBaseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function reportPath(loc: { building: string; space?: string | null; asset?: string | null }): string {
  const q = new URLSearchParams({ qr: "1", building: loc.building });
  if (loc.space) q.set("space", loc.space);
  if (loc.asset) q.set("asset", loc.asset);
  return `/report?${q.toString()}`;
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#001d36", light: "#ffffff" } });
}
