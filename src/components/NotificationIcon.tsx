import { AlertTriangle, CheckCircle2, Info, Siren } from "lucide-react";

/** A small square mark in the tone's color; red/orange only for overdue and safety alerts. */
const TONE = {
  info: { Icon: Info, color: "var(--navy)", label: "Update" },
  success: { Icon: CheckCircle2, color: "var(--st-fixed)", label: "Fixed" },
  warning: { Icon: AlertTriangle, color: "var(--sev-urgent)", label: "Needs attention" },
  danger: { Icon: Siren, color: "var(--sev-emergency)", label: "Urgent" },
} as const;

export function NotificationIcon({ tone }: { tone: string }) {
  const t = TONE[tone as keyof typeof TONE] ?? TONE.info;
  return (
    <span aria-hidden className="mt-[0.2rem] grid size-[1.125rem] shrink-0 place-items-center" style={{ color: t.color }}>
      <t.Icon className="size-[1.0625rem]" strokeWidth={2.5} />
    </span>
  );
}
