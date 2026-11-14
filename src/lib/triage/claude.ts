import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  LOCATION_TYPE_LABEL,
  SEVERITIES,
  type Category,
  type LocationType,
  type Severity,
} from "@/lib/domain";
import { APP_CONFIG } from "@/config/app";

const TriageSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  summary: z.string(),
  rationale: z.string(),
  safety_concern: z.boolean(),
});

export type ClaudeTriage = z.infer<typeof TriageSchema>;

export type TriageImage = { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string };

const t = APP_CONFIG.responseTargetHours;

// Kept byte-stable across requests so it can be served from the prompt cache.
const SYSTEM_PROMPT = `You triage maintenance reports from students at ${APP_CONFIG.campusName}.
Read the report (and photo, if any) and classify it.

Categories (use the key):
${CATEGORIES.map((c) => `- ${c}: ${CATEGORY_LABEL[c]}`).join("\n")}

Severity:
- EMERGENCY (respond within ${t.EMERGENCY}h): immediate danger to people or major property damage in progress — gas smell, flooding, exposed or sparking wiring, smoke or fire, someone trapped in an elevator, sewage.
- URGENT (within ${t.URGENT}h): makes a space unusable or insecure, or affects many people — no heat or hot water, active leak, door that won't lock, building-wide Wi-Fi outage, projector down right before a class.
- STANDARD (within ${t.STANDARD}h): something broken that people can work around.
- LOW (within ${t.LOW}h): cosmetic or minor.

Rules:
- Base the severity on what the student describes, not on how upset they sound.
- If there is any sign of a safety hazard, set safety_concern to true and severity to EMERGENCY.
- summary: one plain sentence, under 80 characters, naming the problem and where it is, written for a maintenance technician. No ticket jargon.
- rationale: one short sentence explaining the category and severity.`;

let client: Anthropic | null = null;

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
}

export async function classifyWithClaude(input: {
  description: string;
  locationType: LocationType;
  locationLabel: string;
  assetName?: string | null;
  image?: TriageImage | null;
}): Promise<ClaudeTriage> {
  client ??= new Anthropic({ timeout: 25_000, maxRetries: 1 });

  const context = [
    `Location: ${input.locationLabel} (${LOCATION_TYPE_LABEL[input.locationType]})`,
    input.assetName ? `Equipment: ${input.assetName}` : null,
    `Report: ${input.description}`,
  ]
    .filter(Boolean)
    .join("\n");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType, data: input.image.base64 },
    });
  }
  content.push({ type: "text", text: context });

  const response = await client.beta.messages.parse({
    model: claudeModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    // Classification is a quick, well-specified task: low effort keeps it fast.
    output_config: { effort: "low", format: betaZodOutputFormat(TriageSchema) },
    // If the model declines, the API retries on its default fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") throw new Error("Classifier declined the request");
  if (response.stop_reason === "max_tokens") throw new Error("Classifier response was cut off");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Classifier returned no structured output");
  return parsed;
}

export type { Category, Severity };
