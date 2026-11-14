import { SAFETY_EXCEPTIONS, SAFETY_PATTERNS } from "@/config/app";

/**
 * Deterministic safety check. Runs on every report, whether or not the AI
 * classifier is available, and its verdict always wins: a match means Emergency.
 * Returns the hazard labels found (empty when the report looks safe).
 */
export function detectSafetyHazards(text: string): string[] {
  const cancelled = new Set(SAFETY_EXCEPTIONS.filter((e) => e.pattern.test(text)).map((e) => e.cancels));
  const found: string[] = [];
  for (const { pattern, label } of SAFETY_PATTERNS) {
    if (cancelled.has(label)) continue;
    if (pattern.test(text) && !found.includes(label)) found.push(label);
  }
  return found;
}
