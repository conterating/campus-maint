import { AlertTriangle, CheckCircle2, Info, Siren } from "lucide-react";

const TONE = {
  info: { Icon: Info, fg: "text-navy", bg: "bg-navy-50" },
  success: { Icon: CheckCircle2, fg: "text-resolved", bg: "bg-[#ecfdf3]" },
  warning: { Icon: AlertTriangle, fg: "text-urgent", bg: "bg-urgent-bg" },
  danger: { Icon: Siren, fg: "text-emergency", bg: "bg-emergency-bg" },
} as const;

export function NotificationIcon({ tone }: { tone: string }) {
  const t = TONE[tone as keyof typeof TONE] ?? TONE.info;
  return (
    <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${t.bg} ${t.fg}`}>
      <t.Icon className="size-3.5" strokeWidth={2.4} />
    </span>
  );
}
