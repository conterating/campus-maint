import { routeTicket } from "@/config/routing";
import { isSkill, locationTypeFor, type Category, type Department, type Severity, type Skill } from "@/lib/domain";
import { deriveRequiredSkills, estimateMinutes } from "@/lib/scheduling/skills";
import { classifyByKeywords } from "./keywords";
import { detectSafetyHazards } from "./safety";
import { classifyWithClaude, claudeConfigured, type ClaudeTriage, type TriageImage } from "./claude";

export type TriageInput = {
  description: string;
  buildingKind: string;
  spaceScope: string | null;
  locationLabel: string;
  assetType?: string | null;
  assetName?: string | null;
  image?: TriageImage | null;
};

export type TriageResult = {
  category: Category;
  severity: Severity;
  department: Department;
  summary: string;
  rationale: string;
  source: "claude" | "keywords";
  /** Safety hazards detected. Non-empty means Emergency and the police banner. */
  hazards: string[];
  routeRule: string;
  /** Skills the job needs (the AI's, merged with category and keyword hints) and a rough duration. */
  requiredSkills: Skill[];
  estimatedMinutes: number;
  /** Set when the AI was configured but failed and we fell back to keywords. */
  fallbackReason?: string;
};

export type TriageDeps = {
  configured: () => boolean;
  claude: (input: Parameters<typeof classifyWithClaude>[0]) => Promise<ClaudeTriage>;
};

const defaultDeps: TriageDeps = { configured: claudeConfigured, claude: classifyWithClaude };

export async function triage(input: TriageInput, deps: TriageDeps = defaultDeps): Promise<TriageResult> {
  const locationType = locationTypeFor(input.buildingKind, input.spaceScope);
  const hazards = detectSafetyHazards(input.description);

  let category: Category;
  let severity: Severity;
  let summary: string;
  let rationale: string;
  let source: TriageResult["source"] = "keywords";
  let fallbackReason: string | undefined;
  let aiSkills: Skill[] = [];
  let aiMinutes: number | null = null;

  const kw = () => classifyByKeywords(input.description, { assetType: input.assetType });

  if (deps.configured()) {
    try {
      const ai = await deps.claude({
        description: input.description,
        locationType,
        locationLabel: input.locationLabel,
        assetName: input.assetName,
        image: input.image,
      });
      ({ category, severity, summary, rationale } = ai);
      source = "claude";
      aiSkills = (ai.required_skills ?? []).filter(isSkill);
      aiMinutes = ai.estimated_minutes ?? null;
      if (ai.safety_concern && ai.severity === "EMERGENCY" && hazards.length === 0) {
        hazards.push("Safety concern spotted by AI");
      }
    } catch (err) {
      fallbackReason = err instanceof Error ? err.message : "AI classifier unavailable";
      ({ category, severity, summary, rationale } = kw());
    }
  } else {
    ({ category, severity, summary, rationale } = kw());
  }

  // The deterministic safety net always wins.
  if (hazards.length > 0) {
    severity = "EMERGENCY";
    rationale = `Safety: ${hazards.join(", ")}. ${rationale}`;
  } else if (severity === "EMERGENCY") {
    // Emergency is reserved for safety hazards; anything else is at most Urgent.
    severity = "URGENT";
  }

  const route = routeTicket(category, locationType);
  const requiredSkills = [...new Set([...aiSkills, ...deriveRequiredSkills(category, input.description)])].slice(0, 4);
  const estimatedMinutes = Math.min(480, Math.max(15, Math.round(aiMinutes ?? estimateMinutes(category, requiredSkills))));
  return {
    category,
    severity,
    department: route.department,
    summary: summary.trim().slice(0, 120),
    rationale,
    source,
    hazards,
    routeRule: route.rule,
    requiredSkills,
    estimatedMinutes,
    fallbackReason,
  };
}
