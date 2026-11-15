// Which skills a job needs, and how long it takes. Deterministic: used both as the
// fallback when Claude isn't configured and as a merge on top of what Claude says.
import { CATEGORY_SKILLS, SKILLS, parseKeyList, type Category, type Skill } from "../domain";

/** Words in a report that imply a skill beyond what its category already needs. */
const KEYWORD_SKILLS: [RegExp, Skill][] = [
  [/\b(breaker|outlet|sparks?|sparking|wiring|wires?|circuit|power (?:strip|out|outage)|ballast)\b/i, "ELECTRICIAN"],
  [/\b(locks?|locked|keys?|keycard|key ?card|deadbolt|door ?knob|latch|badge reader)\b/i, "LOCKSMITH"],
  [/\b(leaks?|leaking|drain|clog(?:ged)?|toilet|pipes?|faucet|sink|shower|flood(?:ing)?|sewage|water heater|burst)\b/i, "PLUMBER"],
  [/\b(heat|heating|a\/?c|air ?condition(?:er|ing)?|thermostat|hvac|furnace|boiler|chiller)\b/i, "HVAC_TECH"],
  [/\b(wi-?fi|ethernet|network|router|internet|access point)\b/i, "NETWORK_TECH"],
  [/\b(projector|speaker|microphone|hdmi|podium)\b/i, "AV_TECH"],
  [/\b(elevator|stuck between floors)\b/i, "ELEVATOR_TECH"],
  [/\b(washer|dryer|fridge|refrigerator|oven|dishwasher|microwave|ice machine)\b/i, "APPLIANCE_REPAIR"],
  [/\b(paint|peeling|scuff)\b/i, "PAINTER"],
  [/\b(roof|gutter|shingle)\b/i, "ROOFER"],
  [/\b(pests?|roach(?:es)?|ants?|mice|mouse|rats?|bed ?bugs?|insects?)\b/i, "PEST_CONTROL"],
  [/\b(spill|trash|vomit|mold)\b/i, "CUSTODIAL"],
  [/\b(hinge|drywall|cabinet door|broken (?:desk|chair|shelf|bed frame))\b/i, "CARPENTER"],
];

/** Skills a job needs: its category's defaults plus anything the description implies. */
export function deriveRequiredSkills(category: Category, description: string): Skill[] {
  const out = new Set<Skill>(CATEGORY_SKILLS[category]);
  for (const [re, skill] of KEYWORD_SKILLS) if (re.test(description)) out.add(skill);
  // A generic category plus a specific hint: the specific skill is what matters.
  if (out.size > 1 && out.has("GENERAL_MAINTENANCE")) out.delete("GENERAL_MAINTENANCE");
  return [...out].slice(0, 3);
}

/** Rough on-site minutes, by category. */
const BASE_MINUTES: Record<Category, number> = {
  PLUMBING: 75,
  ELECTRICAL: 60,
  HVAC: 90,
  ELEVATOR: 120,
  APPLIANCE: 60,
  NETWORK: 45,
  AV_TECH: 30,
  FURNITURE: 30,
  DOORS_LOCKS: 45,
  CLEANING: 45,
  FOOD_SERVICE: 75,
  FITNESS: 60,
  STRUCTURAL: 120,
  OTHER: 60,
};
export function estimateMinutes(category: Category, skills: readonly Skill[] = []): number {
  return BASE_MINUTES[category] + Math.max(0, skills.length - 1) * 30;
}

export const parseSkills = (csv: string | null | undefined): Skill[] => parseKeyList(csv, SKILLS);

/** Skills a contractor has; with none set, derived from their trades (old data). */
export function contractorSkillSet(c: { skills: string | null | undefined }, tradeCategories: readonly Category[]): Skill[] {
  const own = parseSkills(c.skills);
  if (own.length) return own;
  return [...new Set(tradeCategories.flatMap((cat) => CATEGORY_SKILLS[cat]))];
}
