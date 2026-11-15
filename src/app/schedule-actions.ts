"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { now } from "@/lib/clock";
import { getViewer, requireRole } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { ID, check } from "@/lib/action-schemas";
import { addBreak, backToWork, deleteBreak, staffAutoAssign, takeBreakNow } from "@/lib/scheduling/service";
import * as z from "zod";

const refresh = () => revalidatePath("/", "layout");

const breakSchema = z.object({
  dayOffset: z.number().int().min(0).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.number().int().min(5).max(240).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().max(200).nullish(),
});

async function contractor() {
  return requireRole(await getViewer(), "CONTRACTOR");
}

export async function addBreakAction(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    const v = await contractor();
    const parsed = breakSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the break's day, start time and length." };
    const data = await addBreak(prisma, v, parsed.data, await now());
    refresh();
    return { ok: true, data };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteBreakAction(breakId: string): Promise<ActionResult> {
  try {
    await deleteBreak(prisma, await contractor(), check(ID, breakId), await now());
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function takeBreakNowAction(minutes: number): Promise<ActionResult> {
  try {
    await takeBreakNow(prisma, await contractor(), Number(minutes), await now());
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function backToWorkAction(): Promise<ActionResult> {
  try {
    await backToWork(prisma, await contractor(), await now());
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

/** Let the scheduler dispatch an unassigned ticket. */
export async function autoAssignAction(ticketId: string): Promise<ActionResult> {
  try {
    const v = requireRole(await getViewer(), "STAFF", "ADMIN");
    await staffAutoAssign(prisma, v, check(ID, ticketId), await now());
    refresh();
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}
