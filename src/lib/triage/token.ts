import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The analyze step returns the AI's verdict to the browser; the submit step needs
// it back to record "what the AI said" next to any student corrections. Signing it
// stops a tampered request from rewriting the AI's original classification.

const secret = process.env.TRIAGE_SIGNING_SECRET || randomBytes(32).toString("hex");

export type SignedAiVerdict = {
  category: string;
  severity: string;
  department: string;
  summary: string;
  source: "claude" | "keywords";
  rationale: string;
  hazards: string[];
  descriptionHash: string;
};

function mac(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function hashDescription(text: string): string {
  return createHmac("sha256", "desc").update(text.trim()).digest("base64url").slice(0, 16);
}

export function signVerdict(v: SignedAiVerdict): string {
  const payload = Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function verifyVerdict(token: string | null | undefined): SignedAiVerdict | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = mac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as SignedAiVerdict;
  } catch {
    return null;
  }
}
