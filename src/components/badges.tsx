import {
  AirVent,
  AlertTriangle,
  ArrowUpDown,
  Armchair,
  Bug,
  Building2,
  CircleHelp,
  Dumbbell,
  DoorOpen,
  Droplets,
  Projector,
  Utensils,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, type Category, type Severity, type Status } from "@/lib/domain";

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  PLUMBING: Droplets,
  ELECTRICAL: Zap,
  HVAC: AirVent,
  ELEVATOR: ArrowUpDown,
  APPLIANCE: WashingMachine,
  NETWORK: Wifi,
  AV_TECH: Projector,
  FURNITURE: Armchair,
  DOORS_LOCKS: DoorOpen,
  CLEANING: Bug,
  FOOD_SERVICE: Utensils,
  FITNESS: Dumbbell,
  STRUCTURAL: Building2,
  OTHER: CircleHelp,
};

export const SEVERITY_STYLE: Record<Severity, { fg: string; bg: string; bar: string }> = {
  EMERGENCY: { fg: "text-emergency", bg: "bg-emergency-bg", bar: "var(--sev-emergency)" },
  URGENT: { fg: "text-urgent", bg: "bg-urgent-bg", bar: "var(--sev-urgent)" },
  STANDARD: { fg: "text-standard", bg: "bg-standard-bg", bar: "var(--sev-standard)" },
  LOW: { fg: "text-low", bg: "bg-low-bg", bar: "var(--sev-low)" },
};

export const STATUS_COLOR: Record<Status, string> = {
  SUBMITTED: "var(--st-submitted)",
  TRIAGED: "var(--st-triaged)",
  ASSIGNED: "var(--st-assigned)",
  IN_PROGRESS: "var(--st-in-progress)",
  REOPENED: "var(--st-reopened)",
  RESOLVED: "var(--st-resolved)",
  CONFIRMED: "var(--st-confirmed)",
};

/** Raw hex values for places CSS variables can't reach (map pins, SVG data URIs). */
export const STATUS_HEX: Record<Status, string> = {
  SUBMITTED: "#5f6b7c",
  TRIAGED: "#6b3fd4",
  ASSIGNED: "#0b6a8a",
  IN_PROGRESS: "#c4320a",
  REOPENED: "#b0136b",
  RESOLVED: "#087443",
  CONFIRMED: "#344054",
};

const asStatus = (s: string) => ((s in STATUS_LABEL ? s : "SUBMITTED") as Status);
const asSeverity = (s: string) => ((s in SEVERITY_LABEL ? s : "STANDARD") as Severity);

/** Severity: bar glyph + label, so it never relies on color alone. */
const SEVERITY_BARS: Record<Severity, number> = { EMERGENCY: 4, URGENT: 3, STANDARD: 2, LOW: 1 };

export function SeverityGlyph({ severity, className = "" }: { severity: string; className?: string }) {
  const s = asSeverity(severity);
  if (s === "EMERGENCY") return <AlertTriangle aria-hidden className={`size-3.5 ${className}`} strokeWidth={2.75} />;
  const bars = SEVERITY_BARS[s];
  return (
    <span aria-hidden className={`inline-flex h-3 items-end gap-[2px] ${className}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className="w-[3px] rounded-[1px]" style={{ height: `${i * 4}px`, background: i <= bars ? "currentColor" : "color-mix(in srgb, currentColor 22%, transparent)" }} />
      ))}
    </span>
  );
}

export function SeverityBadge({ severity, size = "md" }: { severity: string; size?: "sm" | "md" }) {
  const s = asSeverity(severity);
  const style = SEVERITY_STYLE[s];
  return (
    <span className={`pill ${style.fg} ${style.bg} ${size === "sm" ? "!text-xs !py-0" : ""}`}>
      <SeverityGlyph severity={s} />
      {SEVERITY_LABEL[s]}
    </span>
  );
}

/** Quiet inline severity for dense rows: glyph + label in the severity color, no fill. */
export function SeverityText({ severity }: { severity: string }) {
  const s = asSeverity(severity);
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold ${SEVERITY_STYLE[s].fg}`}>
      <SeverityGlyph severity={s} />
      {SEVERITY_LABEL[s]}
    </span>
  );
}

export function StatusPill({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const s = asStatus(status);
  const color = STATUS_COLOR[s];
  return (
    <span
      className={`pill ${size === "sm" ? "!text-xs" : ""}`}
      style={{ color, background: `color-mix(in srgb, ${color} 9%, white)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, white)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />
      {STATUS_LABEL[s]}
    </span>
  );
}

export function CategoryIcon({ category, size = "md" }: { category: string; size?: "sm" | "md" | "lg" }) {
  const c = (category in CATEGORY_LABEL ? category : "OTHER") as Category;
  const Icon = CATEGORY_ICON[c];
  const dims = size === "sm" ? "size-8 rounded-[4px]" : size === "lg" ? "size-12 rounded-[6px]" : "size-10 rounded-[5px]";
  return (
    <span aria-hidden className={`${dims} grid shrink-0 place-items-center bg-navy-50 text-navy ring-1 ring-inset ring-navy-100`}>
      <Icon className={size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5"} strokeWidth={1.9} />
    </span>
  );
}

export function CategoryChip({ category }: { category: string }) {
  const c = (category in CATEGORY_LABEL ? category : "OTHER") as Category;
  const Icon = CATEGORY_ICON[c];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <Icon aria-hidden className="size-4 text-ink-3" />
      {CATEGORY_LABEL[c]}
    </span>
  );
}
