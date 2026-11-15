import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { listVisibleTickets } from "@/lib/tickets";
import { OPEN_STATUSES } from "@/lib/domain";
import { loadContractorLocations } from "@/lib/contractor-locations";
import type { MapPoint } from "@/app/map/MapClient";
import { AdminMapClient } from "./AdminMapClient";
import { AdminNav } from "../AdminNav";

export const metadata: Metadata = { title: "Live map" };
export const dynamic = "force-dynamic";

export default async function AdminMapPage() {
  const { viewer, now } = await getContext();
  // Role check, not can(): STAFF can hold canViewAnalytics but must not see where contractors are.
  requirePageRole(viewer, "ADMIN");

  const [contractors, tickets] = await Promise.all([loadContractorLocations(prisma, now), listVisibleTickets(prisma, viewer, { status: { in: OPEN_STATUSES } })]);

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
    following: false,
    meToo: false,
    isReporter: false,
    isOwner: false,
    createdAt: t.createdAt.toISOString(),
    readOnly: true,
  }));

  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
  return <AdminMapClient contractors={contractors} points={points} now={now.toISOString()} googleKey={googleKey} nav={<AdminNav viewer={viewer} current="map" />} />;
}
