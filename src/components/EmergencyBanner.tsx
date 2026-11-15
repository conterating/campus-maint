import { Phone, Siren } from "lucide-react";

export function EmergencyBanner({
  police,
  hazards,
  compact = false,
}: {
  police: { label: string; phone: string; tel: string };
  hazards?: string[];
  compact?: boolean;
}) {
  return (
    <section role="alert" aria-labelledby="emergency-title" className="overflow-hidden rounded-[10px] border border-emergency/40 bg-emergency-bg shadow-[var(--shadow-sm)]">
      <div aria-hidden className="hazard h-1.5" />
      <div className={`flex flex-col gap-4 sm:flex-row sm:items-center ${compact ? "p-4" : "p-5"}`}>
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-emergency text-white">
          <Siren className="size-5" />
        </span>
        <div className="flex-1">
          <h2 id="emergency-title" className="font-display text-[1.0625rem] font-bold text-emergency">
            Emergency{hazards?.length ? `: ${hazards.join(", ")}` : ""}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            If anyone is in danger, leave the area and call {police.label} now. This report skips the queue and alerts the on-call supervisor.
          </p>
        </div>
        <a href={`tel:${police.tel}`} className="btn btn-danger shrink-0">
          <Phone aria-hidden className="size-4" />
          <span className="num">{police.phone}</span>
        </a>
      </div>
    </section>
  );
}
