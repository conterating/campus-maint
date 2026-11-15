"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { advanceClock, now, resetClock } from "@/lib/clock";
import { DEFAULT_VIEWER_ID, getViewer, VIEWER_COOKIE } from "@/lib/session";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { canReportAt, isStaff } from "@/lib/visibility";
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
// Demo controls
// ---------------------------------------------------------------------------

export async function switchViewer(userId: string): Promise<ActionResult<{ home: string }>> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "That demo user doesn't exist. Reset the demo data." };
  (await cookies()).set(VIEWER_COOKIE, user.id, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  refreshAll();
  return { ok: true, data: { home: user.role === "ADMIN" ? "/admin" : user.role === "STAFF" ? "/staff" : "/" } };
}

export async function fastForward(hours: number): Promise<ActionResult<{ escalated: number }>> {
  if (![0.5, 1, 4, 24, 48].includes(hours)) return { ok: false, error: "Pick one of the fast-forward options." };
  await advanceClock(hours * 3_600_000);
  const escalated = await runEscalationSweep(prisma, await now());
  refreshAll();
  return { ok: true, data: { escalated } };
}

export async function resetDemoClock(): Promise<ActionResult> {
  await resetClock();
  refreshAll();
  return { ok: true, data: undefined };
}

export async function resetDemoData(): Promise<ActionResult> {
  await seedDatabase(prisma, { quiet: true });
  const jar = await cookies();
  if (!jar.get(VIEWER_COOKIE)) jar.set(VIEWER_COOKIE, DEFAULT_VIEWER_ID, { path: "/", sameSite: "lax", httpOnly: true });
  refreshAll();
  return { ok: true, data: undefined };
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
    const viewer = await getViewer();
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
    const viewer = await getViewer();
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
    const res = await setFollow(prisma, await getViewer(), ticketId, follow, await now());
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

async function staffViewer() {
  const viewer = await getViewer();
  if (!isStaff(viewer)) throw new AppError("Only staff can do that.", "FORBIDDEN");
  return viewer;
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

// ---------------------------------------------------------------------------
// Comments (anyone who can see the ticket)
// ---------------------------------------------------------------------------

export async function commentAction(formData: FormData): Promise<ActionResult> {
  try {
    const viewer = await getViewer();
    const ticketId = str(formData, "ticketId");
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
    await staffAddNote(prisma, await staffViewer(), ticketId, text, internal, await now());
    refreshAll();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}
