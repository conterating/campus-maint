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
import { ID, TEXT, check, schemas } from "@/lib/action-schemas";
import { triage, type TriageResult } from "@/lib/triage";
import { classifyByKeywords } from "@/lib/triage/keywords";
import { hashDescription, signVerdict, verifyVerdict } from "@/lib/triage/token";
import { PHOTO_URL_PATTERN, savePhoto } from "@/lib/uploads";
import { routeTicket } from "@/config/routing";
import { MAX_COMMENT_PHOTOS, locationTypeFor } from "@/lib/domain";
import {
  addComment,
  addMeToo,
  confirmResolution,
  contractorAddNote,
  contractorFinishWork,
  contractorSetAvailability,
  contractorStartWork,
  createTicket,
  findDuplicates,
  getVisibleTicketOrThrow,
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
    userId = check(ID, userId);
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
    for (const k of ["buildingId", "spaceId", "assetId"]) check(ID.nullable(), str(formData, k));

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
      requiredSkills: result.requiredSkills,
      estimatedMinutes: result.estimatedMinutes,
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
    input = check(schemas.submitReport, input);
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
    const res = await addMeToo(prisma, await getViewer(), check(ID, ticketId), await now());
    refreshAll();
    return { ok: true, data: res };
  } catch (err) {
    return toActionError(err);
  }
}

export async function followAction(ticketId: string, follow: boolean): Promise<ActionResult<{ following: boolean }>> {
  try {
    const res = await setFollow(prisma, requireRole(await getViewer(), "STUDENT", "STAFF", "ADMIN"), check(ID, ticketId), check(schemas.follow, follow), await now());
    refreshAll();
    return { ok: true, data: res };
  } catch (err) {
    return toActionError(err);
  }
}

export async function confirmAction(ticketId: string): Promise<ActionResult> {
  try {
    await confirmResolution(prisma, await getViewer(), check(ID, ticketId), await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function reopenAction(ticketId: string, reason: string): Promise<ActionResult> {
  try {
    await reopenTicket(prisma, await getViewer(), check(ID, ticketId), check(TEXT, reason), await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const viewer = await getViewer();
  const parsedIds = schemas.ids.safeParse(ids);
  if (!parsedIds.success) return { ok: false, error: "Check the form and try again." };
  ids = parsedIds.data;
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
    const v = await staffViewer();
    const input = check(schemas.staffStatus, { status, note, assigneeId });
    await staffSetStatus(prisma, v, check(ID, ticketId), input, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function staffReassignAction(ticketId: string, department: string, reason?: string): Promise<ActionResult> {
  try {
    const v = await staffViewer();
    const input = check(schemas.reassign, { department, reason });
    await staffReassign(prisma, v, check(ID, ticketId), input.department, input.reason ?? null, await now());
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
    const v = await staffViewer();
    await staffOverride(prisma, v, check(ID, ticketId), check(schemas.override, input), await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

// ---------------------------------------------------------------------------
// Comments (anyone who can see the ticket)
// ---------------------------------------------------------------------------

export async function commentAction(formData: FormData): Promise<ActionResult> {
  try {
    const viewer = await getViewer();
    const ticketId = str(formData, "ticketId");
    check(TEXT, str(formData, "text") ?? "");
    check(ID.nullable(), ticketId);
    if (!ticketId) throw new AppError("That ticket doesn't exist or isn't visible to you.", "NOT_FOUND");
    const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_COMMENT_PHOTOS) throw new AppError(`Add up to ${MAX_COMMENT_PHOTOS} photos per comment.`);
    // Check visibility before writing any files for this request.
    await getVisibleTicketOrThrow(prisma, viewer, ticketId);
    const photoUrls: string[] = [];
    for (const f of files) photoUrls.push((await savePhoto(f)).url);
    await addComment(prisma, viewer, ticketId, { text: str(formData, "text") ?? "", photoUrls }, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function staffNoteAction(ticketId: string, text: string, internal: boolean): Promise<ActionResult> {
  try {
    const v = await staffViewer();
    const n = check(schemas.note, { text, internal });
    await staffAddNote(prisma, v, check(ID, ticketId), n.text, n.internal, await now());
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
    const v = await staffViewer();
    const a = check(schemas.assign, { assigneeId, note });
    await staffSetStatus(prisma, v, check(ID, ticketId), { status: "ASSIGNED", assigneeId: a.assigneeId, note: a.note }, await now());
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
    const v = await contractorViewer();
    await contractorStartWork(prisma, v, check(ID, ticketId), check(schemas.optNote, note) ?? null, await now());
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
    const v = await contractorViewer();
    await contractorAddNote(prisma, v, check(ID, ticketId), check(TEXT, text), await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setAvailabilityAction(availability: string): Promise<ActionResult> {
  try {
    const v = await contractorViewer();
    await contractorSetAvailability(prisma, v, check(schemas.availability, availability));
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}
