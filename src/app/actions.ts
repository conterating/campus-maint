"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { advanceClock, now, resetClock } from "@/lib/clock";
import { demoModeEnabled, getActor, getViewer, homeFor, IMPERSONATE_COOKIE, impersonationValue, requireRole } from "@/lib/session";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { canReportAt } from "@/lib/visibility";
import { writeAudit } from "@/lib/audit";
import { finishWorkSchema } from "@/lib/auth-schemas";
import { triage, type TriageResult } from "@/lib/triage";
import { classifyByKeywords } from "@/lib/triage/keywords";
import { hashDescription, signVerdict, verifyVerdict } from "@/lib/triage/token";
import { PHOTO_URL_PATTERN, savePhoto } from "@/lib/uploads";
import { routeTicket } from "@/config/routing";
import { locationTypeFor } from "@/lib/domain";
import {
  addMeToo,
  confirmResolution,
  contractorAddNote,
  contractorFinishWork,
  contractorSetAvailability,
  contractorStartWork,
  createTicket,
  findDuplicates,
  locationLabel,
  reopenTicket,
  resolveLocation,
  runEscalationSweep,
  setFollow,
  staffAddNote,
  staffOverride,
  staffReassign,
  staffSetStatus,
} from "@/lib/tickets";
import { seedDatabase } from "@/lib/seed";

const refreshAll = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------------------
// Demo controls: only for a signed-in ADMIN, and only when DEMO_MODE=true
// ---------------------------------------------------------------------------

async function demoAdmin() {
  if (!demoModeEnabled()) throw new AppError("Demo controls are turned off.", "FORBIDDEN");
  const actor = await getActor();
  if (actor.role !== "ADMIN") throw new AppError("Only an administrator can use demo controls.", "FORBIDDEN");
  return actor;
}

/** "View as": impersonate a student, contractor or staff member through a signed cookie. */
export async function switchViewer(userId: string): Promise<ActionResult<{ home: string }>> {
  try {
    const admin = await demoAdmin();
    const jar = await cookies();
    if (userId === admin.id) {
      if (jar.get(IMPERSONATE_COOKIE)) {
        jar.delete(IMPERSONATE_COOKIE);
        await writeAudit(prisma, { actorId: admin.id, action: "IMPERSONATION_STOPPED", targetType: "User", targetId: admin.id });
      }
      refreshAll();
      return { ok: true, data: { home: "/admin" } };
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, error: "That demo user doesn't exist. Reset the demo data." };
    if (user.role === "ADMIN") return { ok: false, error: "You can't view as another administrator." };
    jar.set(IMPERSONATE_COOKIE, impersonationValue(admin.id, user.id), {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 8,
    });
    await writeAudit(prisma, { actorId: admin.id, action: "IMPERSONATION_STARTED", targetType: "User", targetId: user.id, after: { role: user.role } });
    refreshAll();
    return { ok: true, data: { home: homeFor(user.role as never) } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function stopImpersonating(): Promise<ActionResult<{ home: string }>> {
  try {
    const admin = await getActor();
    const jar = await cookies();
    if (jar.get(IMPERSONATE_COOKIE)) {
      jar.delete(IMPERSONATE_COOKIE);
      if (admin.role === "ADMIN") await writeAudit(prisma, { actorId: admin.id, action: "IMPERSONATION_STOPPED", targetType: "User", targetId: admin.id });
    }
    refreshAll();
    return { ok: true, data: { home: "/demo" } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function fastForward(hours: number): Promise<ActionResult<{ escalated: number }>> {
  try {
    await demoAdmin();
    if (![0.5, 1, 4, 24, 48].includes(hours)) return { ok: false, error: "Pick one of the fast-forward options." };
    await advanceClock(hours * 3_600_000);
    const escalated = await runEscalationSweep(prisma, await now());
    refreshAll();
    return { ok: true, data: { escalated } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function resetDemoClock(): Promise<ActionResult> {
  try {
    await demoAdmin();
    await resetClock();
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function resetDemoData(): Promise<ActionResult> {
  try {
    const admin = await demoAdmin();
    // Keep the admin's own session, password and authenticator so they stay signed in.
    await seedDatabase(prisma, { quiet: true, preserveUserId: admin.id });
    (await cookies()).delete(IMPERSONATE_COOKIE);
    await writeAudit(prisma, { actorId: admin.id, action: "DEMO_RESET", targetType: "System", targetId: "demo" });
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export type AnalyzeResult = {
  triage: TriageResult;
  token: string;
  photoUrl: string | null;
  locationLabel: string;
  locationType: string;
  duplicates: {
    id: string;
    number: number;
    summary: string;
    status: string;
    severity: string;
    meTooCount: number;
    locationLabel: string;
    createdAt: string;
    reasons: string[];
    reportedByViewer: boolean;
    viewerMeToo: boolean;
  }[];
};

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Step 1 of reporting: classify the report and look for duplicates. Nothing is saved except the photo. */
export async function analyzeReport(formData: FormData): Promise<ActionResult<AnalyzeResult>> {
  try {
    const viewer = requireRole(await getViewer(), "STUDENT", "STAFF", "ADMIN");
    const description = str(formData, "description") ?? "";
    if (description.length < 8) throw new AppError("Describe the problem in a few more words so we can route it.");
    if (description.length > 2000) throw new AppError("Keep the description under 2,000 characters.");
    const buildingId = str(formData, "buildingId");
    if (!buildingId) throw new AppError("Choose the building first.");

    const loc = await resolveLocation(prisma, { buildingId, spaceId: str(formData, "spaceId"), assetId: str(formData, "assetId") });
    const permitted = canReportAt(viewer, {
      buildingKind: loc.building.kind,
      buildingId: loc.building.id,
      spaceScope: loc.space?.scope ?? null,
      spaceId: loc.space?.id ?? null,
    });
    if (!permitted.ok) throw new AppError(permitted.reason, "FORBIDDEN");

    const photo = formData.get("photo");
    const saved = photo instanceof File && photo.size > 0 ? await savePhoto(photo) : null;

    const label = locationLabel(loc);
    const result = await triage({
      description,
      buildingKind: loc.building.kind,
      spaceScope: loc.space?.scope ?? null,
      locationLabel: label,
      assetType: loc.asset?.type,
      assetName: loc.asset?.name,
      image: saved ? { mediaType: saved.mediaType, base64: saved.base64 } : null,
    });

    const dups = await findDuplicates(prisma, viewer, {
      buildingId,
      spaceId: loc.space?.id,
      assetId: loc.asset?.id,
      category: result.category,
      description,
    });

    const token = signVerdict({
      category: result.category,
      severity: result.severity,
      department: result.department,
      summary: result.summary,
      source: result.source,
      rationale: result.rationale,
      hazards: result.hazards,
      descriptionHash: hashDescription(description),
    });

    return {
      ok: true,
      data: {
        triage: result,
        token,
        photoUrl: saved?.url ?? null,
        locationLabel: label,
        locationType: locationTypeFor(loc.building.kind, loc.space?.scope),
        duplicates: dups.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
      },
    };
  } catch (err) {
    return toActionError(err);
  }
}

export type SubmitReportInput = {
  buildingId: string;
  spaceId: string | null;
  assetId: string | null;
  description: string;
  photoUrl: string | null;
  category: string;
  severity: string;
  summary: string;
  token: string;
};

/** Step 2 of reporting: save the ticket with the student's (possibly corrected) classification. */
export async function submitReport(input: SubmitReportInput): Promise<ActionResult<{ id: string; number: number }>> {
  try {
    const viewer = requireRole(await getViewer(), "STUDENT", "STAFF", "ADMIN");
    const photoUrl = input.photoUrl && PHOTO_URL_PATTERN.test(input.photoUrl) ? input.photoUrl : null;
    let verdict = verifyVerdict(input.token);
    if (!verdict || verdict.descriptionHash !== hashDescription(input.description)) {
      // The description changed after analysis (or the token is bad): classify again with keywords.
      const loc = await resolveLocation(prisma, input);
      const kw = classifyByKeywords(input.description, { assetType: loc.asset?.type });
      verdict = {
        category: kw.category,
        severity: kw.severity,
        department: routeTicket(kw.category, locationTypeFor(loc.building.kind, loc.space?.scope)).department,
        summary: kw.summary,
        source: "keywords",
        rationale: kw.rationale,
        hazards: [],
        descriptionHash: hashDescription(input.description),
      };
    }
    const created = await createTicket(
      prisma,
      viewer,
      {
        buildingId: input.buildingId,
        spaceId: input.spaceId,
        assetId: input.assetId,
        description: input.description,
        photoUrl,
        category: input.category,
        severity: input.severity,
        summary: input.summary,
        ai: verdict,
      },
      await now(),
    );
    refreshAll();
    return { ok: true, data: created };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Student actions
// ---------------------------------------------------------------------------

export async function meTooAction(ticketId: string): Promise<ActionResult<{ meTooCount: number; raisedTo: string | null }>> {
  try {
    const res = await addMeToo(prisma, await getViewer(), ticketId, await now());
    refreshAll();
    return { ok: true, data: res };
  } catch (err) {
    return toActionError(err);
  }
}

export async function followAction(ticketId: string, follow: boolean): Promise<ActionResult<{ following: boolean }>> {
  try {
    const res = await setFollow(prisma, requireRole(await getViewer(), "STUDENT", "STAFF", "ADMIN"), ticketId, follow, await now());
    refreshAll();
    return { ok: true, data: res };
  } catch (err) {
    return toActionError(err);
  }
}

export async function confirmAction(ticketId: string): Promise<ActionResult> {
  try {
    await confirmResolution(prisma, await getViewer(), ticketId, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function reopenAction(ticketId: string, reason: string): Promise<ActionResult> {
  try {
    await reopenTicket(prisma, await getViewer(), ticketId, reason, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const viewer = await getViewer();
  await prisma.notification.updateMany({
    where: { userId: viewer.id, read: false, ...(ids ? { id: { in: ids } } : {}) },
    data: { read: true },
  });
  refreshAll();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

// Department checks (STAFF only in their own department; ADMIN everywhere)
// happen inside the staff* services, which load the ticket themselves.
async function staffViewer() {
  return requireRole(await getViewer(), "STAFF", "ADMIN");
}

export async function staffStatusAction(ticketId: string, status: string, note?: string, assigneeId?: string | null): Promise<ActionResult> {
  try {
    await staffSetStatus(prisma, await staffViewer(), ticketId, { status, note, assigneeId }, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function staffReassignAction(ticketId: string, department: string, reason?: string): Promise<ActionResult> {
  try {
    await staffReassign(prisma, await staffViewer(), ticketId, department, reason ?? null, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function staffOverrideAction(
  ticketId: string,
  input: { category?: string; severity?: string; summary?: string; reason?: string },
): Promise<ActionResult> {
  try {
    await staffOverride(prisma, await staffViewer(), ticketId, input, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function staffNoteAction(ticketId: string, text: string, internal: boolean): Promise<ActionResult> {
  try {
    await staffAddNote(prisma, await staffViewer(), ticketId, text, internal, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

/** Dispatch a ticket to a contractor (or department staff). Eligibility is checked in the service. */
export async function assignAction(ticketId: string, assigneeId: string, note?: string): Promise<ActionResult> {
  try {
    if (!assigneeId) throw new AppError("Choose someone to assign.");
    await staffSetStatus(prisma, await staffViewer(), ticketId, { status: "ASSIGNED", assigneeId, note }, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Contractor actions (only on tickets assigned to the signed-in contractor)
// ---------------------------------------------------------------------------

async function contractorViewer() {
  return requireRole(await getViewer(), "CONTRACTOR");
}

export async function startWorkAction(ticketId: string, note?: string): Promise<ActionResult> {
  try {
    await contractorStartWork(prisma, await contractorViewer(), ticketId, note ?? null, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function finishWorkAction(formData: FormData): Promise<ActionResult> {
  try {
    const viewer = await contractorViewer();
    const photo = formData.get("photo");
    const saved = photo instanceof File && photo.size > 0 ? await savePhoto(photo) : null;
    const parsed = finishWorkSchema.safeParse({
      ticketId: formData.get("ticketId"),
      materials: str(formData, "materials") ?? undefined,
      materialsCost: str(formData, "materialsCost") ?? undefined,
      notes: str(formData, "notes") ?? undefined,
    });
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    await contractorFinishWork(prisma, viewer, parsed.data.ticketId, { ...parsed.data, completionPhotoUrl: saved?.url ?? null }, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function contractorNoteAction(ticketId: string, text: string): Promise<ActionResult> {
  try {
    await contractorAddNote(prisma, await contractorViewer(), ticketId, text, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setAvailabilityAction(availability: string): Promise<ActionResult> {
  try {
    await contractorSetAvailability(prisma, await contractorViewer(), availability);
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}
