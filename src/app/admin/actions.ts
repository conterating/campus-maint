"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { appUrl, emailConfigured } from "@/lib/email";
import { now } from "@/lib/clock";
import { getActor, viewerFor } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { ID, check, schemas } from "@/lib/action-schemas";
import {
  FormError,
  createContractor,
  createStaffAccount,
  deactivateContractor,
  decideResidence,
  sendInvite,
  sendPasswordResetFor,
  setAccountDisabled,
  updateContractor,
  updateStaffAccount,
} from "@/lib/accounts";
import { can } from "@/lib/visibility";
import type { FormResult } from "@/app/auth-actions";

// Account administration. The acting user is always the real signed-in person
// (never the user an admin is "viewing as"), and every service checks the
// permission it needs and writes an AuditLog row.

async function actor() {
  return viewerFor(await getActor());
}

function done<T>(data: T): FormResult<T> {
  revalidatePath("/admin", "layout");
  return { ok: true, data };
}

function failed(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (err instanceof FormError) return { ok: false, error: err.message, fieldErrors: err.fields };
  if (err instanceof AppError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
}

export async function createStaffAccountAction(input: unknown): Promise<FormResult<{ id: string }>> {
  try {
    const user = await createStaffAccount(prisma, await actor(), input);
    return done({ id: user.id });
  } catch (err) {
    return failed(err);
  }
}

export async function updateStaffAccountAction(input: unknown): Promise<FormResult<{ changed: boolean }>> {
  try {
    return done(await updateStaffAccount(prisma, await actor(), input));
  } catch (err) {
    return failed(err);
  }
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<FormResult> {
  try {
    const a = await actor();
    await setAccountDisabled(prisma, a, check(ID, userId), check(schemas.follow, disabled));
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function residenceAction(input: { userId: string; decision: "verify" | "reject" | "edit"; residenceBuildingId?: string | null; roomId?: string | null }): Promise<FormResult> {
  try {
    const a = await actor();
    const parsed = schemas.residence.safeParse(input);
    if (!parsed.success) throw new AppError("Choose verify, edit, or reject.");
    await decideResidence(prisma, a, parsed.data, await now());
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function resendInviteAction(userId: string): Promise<FormResult> {
  try {
    const a = await actor();
    const target = await prisma.user.findUnique({ where: { id: check(ID, userId) } });
    if (!target) throw new AppError("That account doesn't exist.", "NOT_FOUND");
    if (!can(a, target.role === "CONTRACTOR" ? "canManageContractors" : "canManageUsers")) throw new AppError("You don't have permission to do that.", "FORBIDDEN");
    const sent = await sendInvite(prisma, a.id, userId);
    if (!sent.emailOk) return failed(new AppError("The invite was created but the email could not be sent. Check the email configuration and try again."));
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function sendResetAction(userId: string): Promise<FormResult> {
  try {
    const res = await sendPasswordResetFor(prisma, await actor(), check(ID, userId), async (email) => {
      if (!emailConfigured()) return { ok: false };
      await auth.api.requestPasswordReset({ body: { email, redirectTo: appUrl("/reset-password") } });
    });
    if (!res.ok) return failed(new AppError("The reset email could not be sent. Check the email configuration and try again."));
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function createContractorAction(input: unknown): Promise<FormResult<{ id: string }>> {
  try {
    const user = await createContractor(prisma, await actor(), input);
    return done({ id: user.id });
  } catch (err) {
    return failed(err);
  }
}

export async function updateContractorAction(input: unknown): Promise<FormResult> {
  try {
    await updateContractor(prisma, await actor(), input);
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function deactivateContractorAction(userId: string): Promise<FormResult> {
  try {
    await deactivateContractor(prisma, await actor(), check(ID, userId), await now());
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}
