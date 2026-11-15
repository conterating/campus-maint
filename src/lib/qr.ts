import "server-only";
import QRCode from "qrcode";

/**
 * Base URL encoded into QR codes. Only configuration is trusted (PUBLIC_BASE_URL,
 * then BETTER_AUTH_URL): the request's Host / X-Forwarded-Host headers are
 * attacker-controlled and would let a forged request print a QR pointing elsewhere.
 */
export async function publicBaseUrl(): Promise<string> {
  const base = process.env.PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
  return base.replace(/\/$/, "");
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
