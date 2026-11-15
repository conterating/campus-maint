"use client";

// Pieces shared by both map renderers (Google Maps, and the Leaflet fallback):
// the pin, the popup card, the heat palette, and the starting view.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, BellOff, Check, Loader2, Users } from "lucide-react";
import { followAction, meTooAction } from "@/app/actions";
import { CATEGORY_LABEL, SEVERITY_LABEL, STATUS_LABEL, formatTicketNumber, isOpenStatus, type Category, type Severity, type Status } from "@/lib/domain";
import { CATEGORY_ICON } from "@/components/badges";
import { StatusText } from "@/components/TicketTag";
import { relativeTime } from "@/lib/format";
import type { MapPoint } from "./MapClient";

export const GT_CENTER = { lat: 33.7752, lng: -84.3985 };

/** Frame campus in the part of the map the floating panel doesn't cover. */
export function initialView(): { center: { lat: number; lng: number }; zoom: number } {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  if (w >= 768) return { center: { lat: GT_CENTER.lat, lng: GT_CENTER.lng - 0.004 }, zoom: 16 };
  return { center: { lat: GT_CENTER.lat + 0.0012, lng: GT_CENTER.lng }, zoom: 15 };
}

/** Pin colors: open issues by severity, anything fixed in green. */
export const PIN_COLOR: Record<Severity | "FIXED", string> = {
  EMERGENCY: "#b42318",
  URGENT: "#c4500a",
  STANDARD: "#1f5fa6",
  LOW: "#5f6b7c",
  FIXED: "#087443",
};

export function pinColor(p: Pick<MapPoint, "status" | "severity">): string {
  if (!isOpenStatus(p.status)) return PIN_COLOR.FIXED;
  return PIN_COLOR[p.severity as Severity] ?? PIN_COLOR.STANDARD;
}

export function pinLabel(p: MapPoint): string {
  return `${p.summary}. ${STATUS_LABEL[p.status as Status]}, ${SEVERITY_LABEL[p.severity as Severity]}${p.meTooCount ? `, ${p.meTooCount + 1} people affected` : ""}`;
}

export const SEVERITY_WEIGHT: Record<string, number> = { EMERGENCY: 1, URGENT: 0.75, STANDARD: 0.5, LOW: 0.3 };
export const heatWeight = (p: MapPoint) => Math.min(1, (SEVERITY_WEIGHT[p.severity] ?? 0.5) * (1 + p.meTooCount * 0.35));
export const HEAT_GRADIENT: Record<number, string> = { 0.25: "#7c9cc4", 0.5: "#eaaa00", 0.78: "#e06c00", 1: "#b42318" };

/** The pin: a teardrop in the severity color with the category's icon inside. */
export function Pin({ p, selected = false }: { p: MapPoint; selected?: boolean }) {
  const color = pinColor(p);
  const fixed = !isOpenStatus(p.status);
  const Icon = fixed ? Check : CATEGORY_ICON[(p.category in CATEGORY_LABEL ? p.category : "OTHER") as Category];
  const size = selected ? 44 : Math.min(40, 32 + p.meTooCount);
  const emergency = p.severity === "EMERGENCY" && !fixed;
  return (
    <span aria-hidden style={{ position: "relative", display: "block", width: size, height: size * 1.22 }}>
      {emergency && (
        <span
          style={{ position: "absolute", left: "50%", top: size * 0.47, width: size * 1.5, height: size * 1.5, transform: "translate(-50%,-50%)", borderRadius: 999, background: "rgb(180 35 24 / .18)", boxShadow: "0 0 0 2px rgb(180 35 24 / .35)" }}
        />
      )}
      <svg viewBox="0 0 32 39" width={size} height={size * 1.22} style={{ position: "relative", filter: "drop-shadow(0 2px 3px rgb(16 24 40 / .35))", opacity: fixed ? 0.9 : 1 }}>
        <path d="M16 38s13-12.1 13-22.9A13 13 0 0 0 3 15.1C3 25.9 16 38 16 38z" fill={color} stroke="#fff" strokeWidth="2" />
      </svg>
      <Icon
        color="#fff"
        strokeWidth={2.4}
        style={{ position: "absolute", left: "50%", top: size * 0.4, width: size * 0.44, height: size * 0.44, transform: "translate(-50%,-50%)" }}
      />
      {p.meTooCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -8,
            minWidth: 19,
            height: 19,
            padding: "0 5px",
            borderRadius: 10,
            background: "#003057",
            color: "#fff",
            font: "700 11px/19px var(--font-sans), system-ui, sans-serif",
            textAlign: "center",
            boxShadow: "0 0 0 2px #fff",
          }}
        >
          {p.meTooCount + 1}
        </span>
      )}
    </span>
  );
}

/** The card that opens from a pin: what, where, and the two things you can do. */
export function PinPopup({ p, now, isStudent }: { p: MapPoint; now: string; isStudent: boolean }) {
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

  const note = p.isReporter ? "You reported this" : p.meToo ? "You said me too" : isOpenStatus(p.status) ? "Private room issue" : "Already fixed";

  return (
    <div className="w-[17rem] font-sans text-[0.9375rem]">
      <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
        <StatusText status={p.status} />
        <span className="num text-xs text-ink-3">{formatTicketNumber(p.number)}</span>
      </div>
      <p className="mt-1.5 font-bold leading-snug text-ink">{p.summary}</p>
      <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-3">{p.where}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-3">
        <span className="font-bold" style={{ color: pinColor({ status: "TRIAGED", severity: p.severity }) }}>
          {SEVERITY_LABEL[p.severity as Severity]}
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(p.createdAt, now)}</span>
        {p.meTooCount > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 font-bold text-ink-2">
              <Users aria-hidden className="size-3.5" /> {p.meTooCount + 1} affected
            </span>
          </>
        )}
      </p>
      {p.guest ? (
        <Link href={`/login?next=${encodeURIComponent(`/tickets/${p.id}`)}`} className="btn btn-accent btn-sm mt-3 w-full">
          Sign in to follow or say me too
        </Link>
      ) : (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {canMeToo ? (
          <button type="button" className="btn btn-accent btn-sm" disabled={busy !== null} onClick={() => act("metoo")}>
            {busy === "metoo" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Users aria-hidden className="size-4" />} Me too
          </button>
        ) : (
          <span className="grid place-items-center rounded-[4px] bg-surface-2 px-2 text-center text-xs font-bold text-ink-3 ring-1 ring-inset ring-line">{note}</span>
        )}
        {p.isOwner ? (
          <span className="grid place-items-center rounded-[4px] bg-surface-2 px-2 text-center text-xs font-bold text-ink-3 ring-1 ring-inset ring-line">Your ticket</span>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={p.following} disabled={busy !== null} onClick={() => act("follow")}>
            {busy === "follow" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : p.following ? <BellOff aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
            {p.following ? "Following" : "Follow"}
          </button>
        )}
      </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-emergency">
          {error}
        </p>
      )}
      <Link href={`/tickets/${p.id}`} className="mt-3 flex items-center justify-center gap-1 rounded-lg py-1 text-sm font-bold text-navy hover:underline">
        Open full ticket <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}

/**
 * Draw a heat map onto a canvas: blurred alpha blobs per point, then colorized
 * through the palette. Shared by the Google overlay (Leaflet uses leaflet.heat).
 */
export function paintHeat(canvas: HTMLCanvasElement, pts: { x: number; y: number; w: number }[], radius: number) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const { x, y, w } of pts) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${Math.max(0.12, w)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const palette = heatPalette();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (!a) continue;
    const j = Math.min(255, a) * 4;
    d[i - 3] = palette[j];
    d[i - 2] = palette[j + 1];
    d[i - 1] = palette[j + 2];
    d[i] = Math.min(200, 40 + a * 0.9);
  }
  ctx.putImageData(img, 0, 0);
}

let cachedPalette: Uint8ClampedArray | null = null;
function heatPalette(): Uint8ClampedArray {
  if (cachedPalette) return cachedPalette;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [stop, color] of Object.entries(HEAT_GRADIENT)) g.addColorStop(Number(stop), color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  cachedPalette = ctx.getImageData(0, 0, 256, 1).data;
  return cachedPalette;
}
