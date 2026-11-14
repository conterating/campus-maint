"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { HeatLayer } from "leaflet.heat";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, BellOff, Loader2, Users } from "lucide-react";
import { followAction, meTooAction } from "@/app/actions";
import { formatTicketNumber, isOpenStatus, SEVERITY_LABEL, STATUS_LABEL, type Severity, type Status } from "@/lib/domain";
import { SeverityText, STATUS_HEX, StatusPill } from "@/components/badges";
import { relativeTime } from "@/lib/format";
import type { MapPoint } from "./MapClient";

const GT_CENTER: [number, number] = [33.7752, -84.3985];

/** Frame campus in the part of the map the floating panel doesn't cover. */
function initialView(): { center: [number, number]; zoom: number } {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  if (w >= 768) return { center: [GT_CENTER[0], GT_CENTER[1] - 0.004], zoom: 16 };
  return { center: [GT_CENTER[0] + 0.0012, GT_CENTER[1]], zoom: 15 };
}
const SEVERITY_WEIGHT: Record<string, number> = { EMERGENCY: 1, URGENT: 0.75, STANDARD: 0.5, LOW: 0.3 };

function pinIcon(p: MapPoint): L.DivIcon {
  const color = STATUS_HEX[p.status as Status] ?? "#5f6b7c";
  const size = Math.min(40, 28 + p.meTooCount * 2);
  const h = size * 1.25;
  const emergency = p.severity === "EMERGENCY" && isOpenStatus(p.status);
  const ring = emergency ? `<circle cx="16" cy="15" r="14.6" fill="none" stroke="#b42318" stroke-width="2.6" stroke-dasharray="4 2.4"/>` : "";
  const badge =
    p.meTooCount > 0
      ? `<span style="position:absolute;top:-5px;right:-7px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#003057;color:#fff;font:700 10.5px/18px var(--font-mono),monospace;text-align:center;box-shadow:0 0 0 2px #fff">${p.meTooCount}</span>`
      : "";
  const html = `<span style="position:relative;display:block;width:${size}px;height:${h}px">
    <svg viewBox="0 0 32 40" width="${size}" height="${h}" aria-hidden="true" style="filter:drop-shadow(0 2px 2px rgb(16 24 40 / .3))">
      <path d="M16 39s13-12.4 13-23.5A13 13 0 0 0 3 15.5C3 26.6 16 39 16 39z" fill="${color}" stroke="#fff" stroke-width="2.2"/>
      <circle cx="16" cy="15" r="4.6" fill="#fff"/>
      ${ring}
    </svg>${badge}</span>`;
  return L.divIcon({ html, className: "fx-pin", iconSize: [size, h], iconAnchor: [size / 2, h], popupAnchor: [0, -h * 0.9] });
}

function Heat({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const data = points.map((p) => [p.lat, p.lng, Math.min(1, (SEVERITY_WEIGHT[p.severity] ?? 0.5) * (1 + p.meTooCount * 0.35))] as [number, number, number]);
    const layer = new HeatLayer(data, {
      radius: 40,
      blur: 32,
      maxZoom: 17,
      minOpacity: 0.2,
      gradient: { 0.3: "#6b3fd4", 0.55: "#eaaa00", 0.8: "#e06c00", 1: "#b42318" },
    });
    (layer as unknown as L.Layer).addTo(map);
    return () => {
      map.removeLayer(layer as unknown as L.Layer);
    };
  }, [map, points]);
  return null;
}

function PinPopup({ p, now, isStudent }: { p: MapPoint; now: string; isStudent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"metoo" | "follow" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canMeToo = isStudent && isOpenStatus(p.status) && !p.isReporter && !p.meToo && p.scope !== "ROOM";

  async function act(kind: "metoo" | "follow") {
    setBusy(kind);
    setError(null);
    const res = kind === "metoo" ? await meTooAction(p.id) : await followAction(p.id, !p.following);
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="w-[16.5rem] font-sans">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={p.status} size="sm" />
        <span className="num text-xs text-ink-3">{formatTicketNumber(p.number)}</span>
      </div>
      <p className="mt-2 font-bold leading-snug text-ink">{p.summary}</p>
      <p className="mt-0.5 text-[0.8125rem] text-ink-3">{p.where}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-3">
        <SeverityText severity={p.severity} />
        <span className="inline-flex items-center gap-1 font-bold text-ink-2">
          <Users aria-hidden className="size-3.5" /> {p.meTooCount} me too
        </span>
        <span>{relativeTime(p.createdAt, now)}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canMeToo ? (
          <button type="button" className="btn btn-accent btn-sm" disabled={busy !== null} onClick={() => act("metoo")}>
            {busy === "metoo" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Users aria-hidden className="size-4" />} Me too
          </button>
        ) : (
          <span className="grid place-items-center rounded-[9px] bg-surface-2 px-2 text-center text-xs font-bold text-ink-3 ring-1 ring-inset ring-line">
            {p.isReporter ? "You reported this" : p.meToo ? "You said me too" : isOpenStatus(p.status) ? "Room issue" : "Resolved"}
          </span>
        )}
        {p.isOwner ? (
          <span className="grid place-items-center rounded-[9px] bg-surface-2 px-2 text-center text-xs font-bold text-ink-3 ring-1 ring-inset ring-line">Your ticket</span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={p.following} disabled={busy !== null} onClick={() => act("follow")}>
            {busy === "follow" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : p.following ? <BellOff aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
            {p.following ? "Following" : "Follow"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-emergency">
          {error}
        </p>
      )}
      <Link href={`/tickets/${p.id}`} className="mt-3 flex items-center justify-center gap-1 text-sm font-bold text-navy hover:underline">
        Open full ticket <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

export default function LeafletMap({ points, showPins, showHeat, now, isStudent }: { points: MapPoint[]; showPins: boolean; showHeat: boolean; now: string; isStudent: boolean }) {
  const icons = useMemo(() => new Map(points.map((p) => [p.id, pinIcon(p)])), [points]);
  // Draw emergencies and popular issues on top.
  const ordered = useMemo(() => [...points].sort((a, b) => a.meTooCount - b.meTooCount), [points]);

  const [view] = useState(initialView);

  return (
    <MapContainer center={view.center} zoom={view.zoom} minZoom={14} maxZoom={19} scrollWheelZoom zoomControl={false} className="h-full w-full" keyboard>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      <ZoomControl position="bottomright" />
      {showHeat && points.length > 0 && <Heat points={points} />}
      {showPins &&
        ordered.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icons.get(p.id)!}
            title={`${p.summary}. ${STATUS_LABEL[p.status as Status]}, ${SEVERITY_LABEL[p.severity as Severity]}${p.meTooCount ? `, ${p.meTooCount} me too` : ""}`}
            alt={p.summary}
            keyboard
            zIndexOffset={p.severity === "EMERGENCY" ? 1000 : p.meTooCount * 10}
          >
            <Popup>
              <PinPopup p={p} now={now} isStudent={isStudent} />
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
