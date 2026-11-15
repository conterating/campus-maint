// Operational settings for Ramblin’ Repairs. Edit these values, not the code that uses them.
import type { Severity } from "@/lib/domain";

export const APP_CONFIG = {
  campusName: "Georgia Tech",

  /** Shown on every Emergency report. Georgia Tech Police Department. */
  campusPolice: {
    label: "Georgia Tech Police",
    phone: "404-894-2500",
    tel: "+14048942500",
  },

  /**
   * First-response targets, in hours. A ticket is overdue when staff have not
   * responded (assigned it, started work, or posted an update) within this window.
   */
  responseTargetHours: {
    EMERGENCY: 1,
    URGENT: 4,
    STANDARD: 48, // 2 days
    LOW: 120, // 5 days
  } satisfies Record<Severity, number>,

  /**
   * When this many students have said "Me too" on a ticket, its severity is raised
   * one level (never above Urgent; Emergency is reserved for safety hazards).
   */
  meTooPriorityThreshold: 3,

  /** Duplicate check: minimum text similarity (0–1) to suggest a match on its own. */
  duplicateTextThreshold: 0.22,

  /** Duplicate check across two different rooms: same category plus at least this similarity. */
  duplicateCrossRoomThreshold: 0.4,
} as const;

/**
 * Safety phrases. A report matching any of these is marked Emergency regardless of
 * what the classifier says, skips the queue, and shows the campus police banner.
 * Patterns are case-insensitive regular expressions.
 */
export const SAFETY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(smell(s|ing|ed)? (of )?gas|gas (leak|smell|odou?r)|leaking gas)\b/i, label: "Possible gas leak" },
  { pattern: /\bcarbon monoxide\b|\bco (alarm|detector) (is )?(going off|sounding|beeping)\b/i, label: "Carbon monoxide" },
  { pattern: /\bflood(ed|ing|s)?\b|\bwater (is )?(pouring|gushing|everywhere)\b|\bburst pipe\b/i, label: "Flooding" },
  { pattern: /\b(exposed|bare|live|sparking|frayed) (electrical )?(wire|wires|wiring)\b|\bsparks?\b|\bsparking\b/i, label: "Exposed or sparking wiring" },
  { pattern: /\belectric(al)? shock\b|\bgot shocked\b/i, label: "Electrical shock" },
  { pattern: /\bsmoke\b|\bsmoking outlet\b|\bburning smell\b|\bsmell(s|ing)? (like )?burning\b|\bon fire\b|\bfire\b/i, label: "Smoke or fire" },
  {
    pattern: /\b(stuck|trapped) (in|inside) (the |an |a )?elevator\b|\belevator\b.{0,40}\b(stuck|trapped)\b|\b(stuck|trapped)\b.{0,40}\belevator\b/i,
    label: "Elevator entrapment",
  },
  { pattern: /\bsewage\b/i, label: "Sewage" },
];

/**
 * Phrases that look alarming but are routine (e.g. a smoke detector that chirps
 * because its battery is low). If one of these matches, the matching safety
 * label above is ignored.
 */
export const SAFETY_EXCEPTIONS: { pattern: RegExp; cancels: string }[] = [
  { pattern: /\bsmoke (detector|alarm)\b.{0,30}\b(chirp|chirping|beep|beeping|battery)\b/i, cancels: "Smoke or fire" },
  { pattern: /\bfire (alarm|extinguisher|door|exit) (sign|light|tag|inspection|cabinet)\b/i, cancels: "Smoke or fire" },
  { pattern: /\bfire ?place\b|\bfire drill\b/i, cancels: "Smoke or fire" },
];

/**
 * Georgia Tech single sign-on (Microsoft Entra ID / GT CAS). Off until OIT
 * approves an app registration; the login page shows a placeholder button.
 */
export const SSO_ENABLED = false;
