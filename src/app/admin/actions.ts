"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { now } from "@/lib/clock";
import { getActor, viewerFor } from "@/lib/session";
import { AppError } from "@/lib/errors";
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
    await setAccountDisabled(prisma, await actor(), userId, disabled);
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function residenceAction(input: { userId: string; decision: "verify" | "reject" | "edit"; residenceBuildingId?: string | null; roomId?: string | null }): Promise<FormResult> {
  try {
    if (!["verify", "reject", "edit"].includes(input.decision)) throw new AppError("Choose verify, edit, or reject.");
    await decideResidence(prisma, await actor(), input, await now());
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function resendInviteAction(userId: string): Promise<FormResult> {
  try {
    const a = await actor();
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new AppError("That account doesn't exist.", "NOT_FOUND");
    if (!can(a, target.role === "CONTRACTOR" ? "canManageContractors" : "canManageUsers")) throw new AppError("You don't have permission to do that.", "FORBIDDEN");
    await sendInvite(prisma, a.id, userId);
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}

export async function sendResetAction(userId: string): Promise<FormResult> {
  try {
    await sendPasswordResetFor(prisma, await actor(), userId, async (email) => {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: appUrl("/reset-password") } });
    });
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
    await deactivateContractor(prisma, await actor(), userId, await now());
    return done(undefined);
  } catch (err) {
    return failed(err);
  }
}
