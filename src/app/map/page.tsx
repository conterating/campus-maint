import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { listVisibleTickets } from "@/lib/tickets";
import { CLOSED_STATUSES, OPEN_STATUSES } from "@/lib/domain";
import { MapClient, type MapPoint } from "./MapClient";

export const metadata: Metadata = { title: "Campus map" };

const RECENT_DAYS = 14;

export default async function MapPage() {
  const { viewer, now } = await getContext();
  const recent = new Date(now.getTime() - RECENT_DAYS * 86_400_000);

  // Visibility is enforced by listVisibleTickets: dorm issues never reach
  // students who don't live there, so they get no pins and no heat.
  const tickets = await listVisibleTickets(prisma, viewer, {
    OR: [{ status: { in: OPEN_STATUSES } }, { status: { in: CLOSED_STATUSES }, updatedAt: { gte: recent } }],
  });
  const ids = tickets.map((t) => t.id);
  const [follows, meToos] = await Promise.all([
    prisma.follow.findMany({ where: { userId: viewer.id, ticketId: { in: ids } }, select: { ticketId: true } }),
    prisma.meToo.findMany({ where: { userId: viewer.id, ticketId: { in: ids } }, select: { ticketId: true } }),
  ]);
  const followSet = new Set(follows.map((f) => f.ticketId));
  const meTooSet = new Set(meToos.map((m) => m.ticketId));

  const points: MapPoint[] = tickets.map((t) => ({
    id: t.id,
    number: t.number,
    lat: t.lat,
    lng: t.lng,
    summary: t.summary,
    status: t.status,
    severity: t.severity,
    category: t.category,
    meTooCount: t.meTooCount,
    where: [t.building.name, t.space?.label, t.asset?.name].filter(Boolean).join(" · "),
    scope: t.scope,
    following: followSet.has(t.id) || t.ownerUserId === viewer.id,
    meToo: meTooSet.has(t.id),
    isReporter: t.reporterId === viewer.id,
    isOwner: t.ownerUserId === viewer.id,
    createdAt: t.createdAt.toISOString(),
  }));

  // A browser key for the Maps JavaScript API (restrict it to your domain in
  // Google Cloud). Without one, the map falls back to OpenStreetMap tiles.
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

  return <MapClient points={points} now={now.toISOString()} isStudent={viewer.role === "STUDENT"} googleKey={googleKey} />;
}
