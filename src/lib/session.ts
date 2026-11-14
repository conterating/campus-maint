import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { now } from "./clock";
import { runEscalationSweep } from "./tickets";
import type { Role } from "./domain";
import type { Viewer } from "./visibility";

// No real login: the demo "view as" switcher stores the chosen seeded user's id
// in a cookie. Every server query derives permissions from this viewer.

export const VIEWER_COOKIE = "rr_viewer";
export const DEFAULT_VIEWER_ID = "u-maya";

export async function getViewer(): Promise<Viewer> {
  const id = (await cookies()).get(VIEWER_COOKIE)?.value ?? DEFAULT_VIEWER_ID;
  const user =
    (await prisma.user.findUnique({ where: { id } })) ??
    (await prisma.user.findUnique({ where: { id: DEFAULT_VIEWER_ID } })) ??
    (await prisma.user.findFirst({ orderBy: { id: "asc" } }));
  if (!user) throw new Error("No users found. Run `npm run db:reset` to seed the database.");
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    department: user.department,
    isSupervisor: user.isSupervisor,
    residenceBuildingId: user.residenceBuildingId,
    roomId: user.roomId,
  };
}

/**
 * Everything a page needs to render: the viewer and the demo clock's "now".
 * Also runs the escalation sweep, so overdue tickets escalate as soon as anyone
 * loads a page after their target passes (including right after a fast-forward).
 */
export async function getContext(): Promise<{ viewer: Viewer; now: Date }> {
  const [viewer, current] = await Promise.all([getViewer(), now()]);
  await runEscalationSweep(prisma, current);
  return { viewer, now: current };
}
