import type { Metadata } from "next";
import { QrCode, TriangleAlert } from "lucide-react";
import { getContext } from "@/lib/session";
import { describeLocation, reportableLocations } from "@/lib/locations";
import { canReportAt } from "@/lib/visibility";
import { claudeConfigured } from "@/lib/triage/claude";
import { APP_CONFIG } from "@/config/app";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = { title: "Report a problem" };

type Search = Promise<{ building?: string; space?: string; asset?: string; qr?: string; desc?: string; where?: string }>;

export default async function ReportPage({ searchParams }: { searchParams: Search }) {
  const { viewer } = await getContext();
  const params = { ...(await searchParams) };
  // The home page's quick form sends `where` (room | hall | campus) instead of ids.
  if (!params.building && viewer.residenceBuildingId && (params.where === "room" || params.where === "hall")) {
    params.building = viewer.residenceBuildingId;
    if (params.where === "room" && viewer.roomId) params.space = viewer.roomId;
  }
  const initialDescription = (params.desc ?? "").slice(0, 2000);
  const locations = await reportableLocations(viewer);
  const scanned = await describeLocation(params);

  let prefill: { buildingId: string; spaceId: string | null; assetId: string | null } | null = null;
  let blocked: string | null = null;
  if (scanned) {
    const allowed = canReportAt(viewer, {
      buildingKind: scanned.building.kind,
      buildingId: scanned.building.id,
      spaceScope: scanned.space?.scope ?? null,
      spaceId: scanned.space?.id ?? null,
    });
    if (allowed.ok) {
      prefill = { buildingId: scanned.building.id, spaceId: scanned.space?.id ?? scanned.asset?.spaceId ?? null, assetId: scanned.asset?.id ?? null };
    } else {
      blocked = allowed.reason;
    }
  }
  const scannedLabel = scanned ? [scanned.building.name, scanned.space?.label, scanned.asset?.name].filter(Boolean).join(" · ") : null;
  const fromQr = params.qr === "1";

  const home = locations.find((b) => b.id === viewer.residenceBuildingId);
  const myRoom = home?.spaces.find((s) => s.id === viewer.roomId);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Report a problem</h1>
      <p className="mt-1.5 text-ink-2">Tell us where and what. We&apos;ll send it to the right team and check if someone beat you to it.</p>

      {scannedLabel && fromQr && !blocked && (
        <p className="mt-5 flex items-center gap-3 rounded-[8px] bg-surface px-4 py-3 text-sm shadow-[var(--shadow-xs)] ring-1 ring-inset ring-line">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-navy-50 text-navy">
            <QrCode className="size-5" />
          </span>
          <span className="text-ink-2">
            <span className="font-bold text-ink">Scanned a QR code.</span> Location filled in: {scannedLabel}
          </span>
        </p>
      )}
      {blocked && (
        <p role="alert" className="mt-5 flex items-start gap-3 rounded-[8px] bg-urgent-bg px-4 py-3 text-sm text-ink ring-1 ring-inset ring-urgent/25">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-urgent" />
          <span>
            <span className="font-bold">This QR code is for {scannedLabel}.</span> {blocked}
          </span>
        </p>
      )}

      <ReportForm
        locations={locations}
        prefill={prefill}
        initialDescription={initialDescription}
        myRoom={home && myRoom ? { buildingId: home.id, spaceId: myRoom.id, label: `${home.name} · ${myRoom.label}` } : null}
        myHall={home ? { buildingId: home.id, label: home.name.replace(/ (Residence Hall|Apartments|Houses)$/, "") } : null}
        aiEnabled={claudeConfigured()}
        police={APP_CONFIG.campusPolice}
        targets={APP_CONFIG.responseTargetHours}
        viewerIsStudent={viewer.role === "STUDENT"}
      />
    </div>
  );
}
