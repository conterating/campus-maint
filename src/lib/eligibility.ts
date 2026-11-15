// Pure rules about who may sign in and who may take a job. Safe to import anywhere.
import { routeTicket } from "@/config/routing";
import {
  CATEGORIES,
  DEPARTMENTS,
  SKILLS,
  SKILL_LABEL,
  LOCATION_TYPES,
  parseKeyList,
  type Category,
  type Department,
} from "./domain";

export const DAY_MS = 86_400_000;
/** Credentials expiring within this many days show a warning. */
export const CREDENTIAL_WARNING_DAYS = 30;

type ContractorLike = {
  backgroundCheckStatus: string;
  contractEndsAt: Date | null;
  contractStartsAt?: Date | null;
};

type SignInUser = {
  role: string;
  disabledAt: Date | null;
  contractorProfile?: ContractorLike | null;
};

/**
 * Why an account can't sign in, or null if it can. The reason is logged on the
 * server only; people always see the same generic message.
 */
export function signInBlockReason(user: SignInUser, now: Date): string | null {
  if (user.disabledAt) return "account disabled";
  if (user.role === "CONTRACTOR") {
    const p = user.contractorProfile;
    if (!p) return "contractor has no profile";
    if (p.backgroundCheckStatus !== "CLEARED") return `background check ${p.backgroundCheckStatus.toLowerCase()}`;
    if (p.contractEndsAt && p.contractEndsAt.getTime() < now.getTime()) return "contract ended";
  }
  return null;
}

export type ContractorForAssignment = {
  userId: string;
  role: string;
  disabledAt: Date | null;
  trades: string;
  /** Comma-separated Skill keys. Empty or missing means "go by trades". */
  skills?: string | null;
  departments: string;
  licenseExpiresAt: Date | null;
  insuranceExpiresAt: Date | null;
  backgroundCheckStatus: string;
  residenceHallAccess: boolean;
  availability: string;
  maxActiveJobs: number;
  contractEndsAt: Date | null;
};

export type TicketForAssignment = {
  department: string;
  category: string;
  scope: string;
  /** Comma-separated Skill keys the job needs. Empty or missing means "go by category". */
  requiredSkills?: string | null;
};

/**
 * Every reason a contractor can't take this ticket right now (empty = eligible).
 * `activeJobs` is how many open tickets are already assigned to them, not
 * counting this one. `forScheduling` is for the auto-scheduler: shifts and work days decide when
 * someone can be booked, so an OFF_DUTY status is ignored.
 */
export function assignmentProblems(c: ContractorForAssignment, t: TicketForAssignment, activeJobs: number, now: Date, opts: { forScheduling?: boolean } = {}): string[] {
  const problems: string[] = [];
  const at = now.getTime();
  if (c.role !== "CONTRACTOR" || c.disabledAt) problems.push("Account is not an active contractor");
  if (c.backgroundCheckStatus !== "CLEARED") problems.push("Background check is not cleared");
  if (c.contractEndsAt && c.contractEndsAt.getTime() < at) problems.push("Contract has ended");
  if (!parseKeyList(c.departments, DEPARTMENTS).includes(t.department as Department)) problems.push("Doesn't work for this department");
  const ownSkills = parseKeyList(c.skills, SKILLS);
  const needed = parseKeyList(t.requiredSkills, SKILLS);
  if (ownSkills.length && needed.length) {
    // Partial cover is fine here: the scheduler adds helpers for the rest. No overlap at all is not.
    if (!needed.some((k) => ownSkills.includes(k))) problems.push(`No matching skill (needs ${needed.map((k) => SKILL_LABEL[k]).join(" or ")})`);
  } else if (!parseKeyList(c.trades, CATEGORIES).includes(t.category as Category)) {
    problems.push("No trade covering this category");
  }
  if (!c.licenseExpiresAt || c.licenseExpiresAt.getTime() < at) problems.push("License expired or missing");
  if (!c.insuranceExpiresAt || c.insuranceExpiresAt.getTime() < at) problems.push("Insurance expired or missing");
  if ((t.scope === "ROOM" || t.scope === "DORM") && !c.residenceHallAccess) problems.push("Not cleared to work inside residence halls");
  // The scheduler plans future shifts (and on-call Emergencies), so "off duty" right now doesn't rule anyone out there;
  // it still blocks a dispatcher's manual "assign now".
  if (c.availability === "OFF_DUTY" && !opts.forScheduling) problems.push("Off duty");
  if (activeJobs >= c.maxActiveJobs) problems.push(`Already has ${activeJobs} active jobs (max ${c.maxActiveJobs})`);
  return problems;
}

/** Days until a date (negative once it has passed), or null if there's no date. */
export function daysUntil(d: Date | null | undefined, now: Date): number | null {
  if (!d) return null;
  return Math.floor((d.getTime() - now.getTime()) / DAY_MS);
}

/** Credential warnings for a contractor's own dashboard and the admin list. */
export function credentialWarnings(c: { licenseExpiresAt: Date | null; insuranceExpiresAt: Date | null }, now: Date): string[] {
  const out: string[] = [];
  for (const [label, d] of [
    ["License", c.licenseExpiresAt],
    ["Insurance", c.insuranceExpiresAt],
  ] as const) {
    const days = daysUntil(d, now);
    if (days === null) out.push(`${label} is missing`);
    else if (days < 0) out.push(`${label} has expired`);
    else if (days <= CREDENTIAL_WARNING_DAYS) out.push(`${label} expires in ${days} day${days === 1 ? "" : "s"}`);
  }
  return out;
}

/** Every category a department can be routed, used to suggest a contractor's trades. */
export function categoriesRoutedTo(department: Department): Category[] {
  return CATEGORIES.filter((c) => LOCATION_TYPES.some((lt) => routeTicket(c, lt).department === department));
}
