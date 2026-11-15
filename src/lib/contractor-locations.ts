// Where each contractor is right now, for the admin live map. Nothing stores
// GPS: a contractor is "working" at the ticket of their open WorkLog (the
// "Start work" check-in), otherwise "last seen" at the ticket of their most
// recent finished log. Contractors with no log at all are listed but unplaced.
import type { PrismaClient } from "@prisma/client";
import { shortName } from "@/lib/tickets";

export type PlaceState = "working" | "last_seen" | "unknown";

export type ContractorLocation = {
  id: string;
  name: string;
  shortName: string;
  company: string;
  /** AVAILABLE | ON_JOB | ON_BREAK | OFF_DUTY */
  availability: string;
  state: PlaceState;
  lat: number | null;
  lng: number | null;
  /** Start of the open job (working) or end of the last one (last_seen). */
  at: string | null;
  ticket: { id: string; number: number; summary: string; where: string } | null;
};

export type LogLike<T> = { startedAt: Date; endedAt: Date | null; ticket: T };

/** Open log wins (newest if several); otherwise the most recently finished one. */
export function pickCurrentLog<T>(logs: LogLike<T>[]): { state: PlaceState; log: LogLike<T> | null } {
  const open = logs.filter((l) => !l.endedAt).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
  if (open) return { state: "working", log: open };
  const last = [...logs].sort((a, b) => (b.endedAt ?? b.startedAt).getTime() - (a.endedAt ?? a.startedAt).getTime())[0];
  return last ? { state: "last_seen", log: last } : { state: "unknown", log: null };
}

/** Working first, then available, then last seen / off duty; name breaks ties. */
export function sortContractors<T extends Pick<ContractorLocation, "state" | "availability" | "name">>(list: T[]): T[] {
  const rank = (c: T) => (c.state === "working" || c.availability === "ON_JOB" ? 0 : c.availability === "AVAILABLE" ? 1 : c.availability === "ON_BREAK" ? 2 : 3);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function summarize(list: Pick<ContractorLocation, "state" | "availability">[]) {
  const working = list.filter((c) => c.state === "working" || c.availability === "ON_JOB").length;
  const rest = list.filter((c) => !(c.state === "working" || c.availability === "ON_JOB"));
  const available = rest.filter((c) => c.availability === "AVAILABLE").length;
  const onBreak = rest.filter((c) => c.availability === "ON_BREAK").length;
  return { working, available, onBreak, offDuty: list.length - working - available - onBreak };
}

/** Fan out markers that share a spot so each stays clickable (deterministic). */
export function spreadOverlaps<T extends { lat: number | null; lng: number | null }>(list: T[]): T[] {
  const seen = new Map<string, number>();
  return list.map((c) => {
    if (c.lat === null || c.lng === null) return c;
    const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return c;
    const angle = n * 2.4;
    const r = 0.00005 * Math.ceil(n / 4 + 0.5);
    return { ...c, lat: c.lat + r * Math.sin(angle), lng: c.lng + r * Math.cos(angle) };
  });
}

export async function loadContractorLocations(db: PrismaClient, now: Date = new Date()): Promise<ContractorLocation[]> {
  const users = await db.user.findMany({
    where: {
      role: "CONTRACTOR",
      disabledAt: null,
      contractorProfile: { is: { OR: [{ contractEndsAt: null }, { contractEndsAt: { gte: now } }] } },
    },
    include: { contractorProfile: true },
    orderBy: { name: "asc" },
  });
  const ids = users.map((u) => u.id);
  const include = { ticket: { select: { id: true, number: true, summary: true, lat: true, lng: true, building: { select: { name: true } }, space: { select: { label: true } } } } } as const;
  // All open logs, plus each contractor's latest finished one.
  const open = await db.workLog.findMany({ where: { contractorId: { in: ids }, endedAt: null }, orderBy: { startedAt: "desc" }, include });
  const openIds = new Set(open.map((l) => l.contractorId));
  const finished = await Promise.all(
    ids
      .filter((id) => !openIds.has(id))
      .map((id) => db.workLog.findFirst({ where: { contractorId: id, endedAt: { not: null } }, orderBy: { endedAt: "desc" }, include })),
  );
  const logs = [...open, ...finished.filter((l): l is NonNullable<typeof l> => l !== null)];
  const byUser = new Map<string, typeof logs>();
  for (const l of logs) byUser.set(l.contractorId, [...(byUser.get(l.contractorId) ?? []), l]);

  const list = users
    .filter((u) => u.contractorProfile)
    .map((u): ContractorLocation => {
      const { state, log } = pickCurrentLog(byUser.get(u.id) ?? []);
      const t = log?.ticket;
      return {
        id: u.id,
        name: u.name,
        shortName: shortName(u.name),
        company: u.contractorProfile!.companyName,
        availability: u.contractorProfile!.availability,
        state,
        lat: t?.lat ?? null,
        lng: t?.lng ?? null,
        at: log ? (state === "working" ? log.startedAt : (log.endedAt ?? log.startedAt)).toISOString() : null,
        ticket: t ? { id: t.id, number: t.number, summary: t.summary, where: [t.building.name, t.space?.label].filter(Boolean).join(" · ") } : null,
      };
    });
  return spreadOverlaps(sortContractors(list));
}
