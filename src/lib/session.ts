import "server-only";
import { cache } from "react";
import { impersonationTarget } from "./impersonation";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ContractorProfile, StaffProfile, User } from "@prisma/client";
import { prisma } from "./db";
import { now } from "./clock";
import { auth, PRIVILEGED_SESSION_MAX_MS } from "./auth";
import { signInBlockReason } from "./eligibility";
import { runEscalationSweep } from "./tickets";
import { AppError } from "./errors";
import { isRole, type Role } from "./domain";
import { ALL_PERMISSIONS, type StaffPermissions, type Viewer } from "./visibility";

// getViewer() is the single source of permissions. It reads the Better Auth
// session, loads the user, and returns the Viewer every query and service uses.
// proxy.ts only does an optimistic redirect when there's no cookie at all.

/** Demo-mode "view as" cookie (signed; honoured only for an ADMIN when DEMO_MODE=true). */
export const IMPERSONATE_COOKIE = "rr_view_as";
/** Set by proxy.ts so server code knows which page is being rendered. */
export const PATHNAME_HEADER = "x-rr-pathname";

export function demoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

type LoadedUser = User & { staffProfile: StaffProfile | null; contractorProfile: ContractorProfile | null };

function permissionsOf(user: LoadedUser): StaffPermissions | undefined {
  if (user.role === "ADMIN") return ALL_PERMISSIONS;
  if (user.role !== "STAFF") return undefined;
  const p = user.staffProfile;
  return {
    canManageUsers: p?.canManageUsers ?? false,
    canManageContractors: p?.canManageContractors ?? false,
    canVerifyResidence: p?.canVerifyResidence ?? false,
    canViewAnalytics: p?.canViewAnalytics ?? false,
    canAssignWork: p?.canAssignWork ?? true,
  };
}

/** Build the Viewer for a user. Unverified students get no hall or room. */
export function viewerFor(user: LoadedUser, impersonator: Viewer["impersonator"] = null): Viewer {
  const role: Role = isRole(user.role) ? user.role : "STUDENT";
  const verified = role !== "STUDENT" || user.residenceVerified;
  return {
    id: user.id,
    name: user.name,
    role,
    department: user.department,
    isSupervisor: user.isSupervisor,
    residenceBuildingId: verified ? user.residenceBuildingId : null,
    roomId: verified ? user.roomId : null,
    permissions: permissionsOf(user),
    residenceVerified: role === "STUDENT" ? user.residenceVerified : undefined,
    impersonator,
  };
}

export { impersonationValue } from "./impersonation";

const loadUser = (id: string) =>
  prisma.user.findUnique({ where: { id }, include: { staffProfile: true, contractorProfile: true } });

export type SessionState =
  | { status: "signed-out" }
  | { status: "blocked"; reason: string }
  | {
      status: "ok";
      /** The person actually signed in (an admin, when impersonating). */
      user: LoadedUser;
      viewer: Viewer;
      sessionId: string;
      needsTwoFactorEnrollment: boolean;
    };

/** Resolve the request's session once per request. Never redirects. */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h }).catch(() => null);
  if (!session) return { status: "signed-out" };

  const user = await loadUser(session.user.id);
  if (!user) return { status: "signed-out" };

  const blocked = signInBlockReason(user, new Date());
  const privileged = user.role === "STAFF" || user.role === "ADMIN";
  const tooOld = privileged && Date.now() - new Date(session.session.createdAt).getTime() > PRIVILEGED_SESSION_MAX_MS;
  if (blocked || tooOld) {
    // End the session server-side; the stale cookie then fails every check.
    await prisma.session.deleteMany({ where: { id: session.session.id } });
    if (blocked) console.warn(`[auth] ended a session for user ${user.id}: ${blocked}`);
    return { status: "blocked", reason: blocked ?? "session too old" };
  }

  let viewer = viewerFor(user);
  const targetId = impersonationTarget({
    actorId: user.id,
    actorRole: user.role,
    demoMode: demoModeEnabled(),
    cookie: (await cookies()).get(IMPERSONATE_COOKIE)?.value,
  });
  if (targetId) {
    const target = await loadUser(targetId);
    if (target && target.role !== "ADMIN" && !target.disabledAt) viewer = viewerFor(target, { id: user.id, name: user.name });
  }

  return {
    status: "ok",
    user,
    viewer,
    sessionId: session.session.id,
    needsTwoFactorEnrollment: user.role === "ADMIN" && !user.twoFactorEnabled,
  };
});

/** The signed-in viewer, or null. For the layout and the sign-in pages. */
export async function getOptionalViewer(): Promise<Viewer | null> {
  const s = await getSessionState();
  return s.status === "ok" ? s.viewer : null;
}

/**
 * The signed-in viewer. Redirects to /login when there's no valid session (no
 * session, disabled account, ineligible contractor), and sends an admin who
 * hasn't enrolled two-factor sign-in to /account/security first.
 */
export async function getViewer(): Promise<Viewer> {
  const s = await getSessionState();
  if (s.status !== "ok") {
    const path = (await headers()).get(PATHNAME_HEADER);
    redirect(path && path !== "/" ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  if (s.needsTwoFactorEnrollment) {
    const path = (await headers()).get(PATHNAME_HEADER) ?? "";
    if (!path.startsWith("/account/security")) redirect("/account/security?enroll=1");
  }
  return s.viewer;
}

/** The real signed-in user behind the viewer (the admin, when impersonating). */
export async function getActor(): Promise<LoadedUser> {
  await getViewer();
  const s = await getSessionState();
  if (s.status !== "ok") redirect("/login");
  return s.user;
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

export { homeFor } from "./access";
import { homeFor } from "./access";

/** For server actions: throw FORBIDDEN unless the viewer has one of these roles. */
export function requireRole(viewer: Viewer, ...roles: Role[]): Viewer {
  if (!roles.includes(viewer.role)) throw new AppError("You don't have access to that.", "FORBIDDEN");
  return viewer;
}

/** For pages: send the viewer to their own home unless they have one of these roles. */
export function requirePageRole(viewer: Viewer, ...roles: Role[]): Viewer {
  if (!roles.includes(viewer.role)) redirect(homeFor(viewer.role));
  return viewer;
}
