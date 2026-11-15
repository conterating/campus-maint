"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getContext, requireRole } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { clearAdvisory, createAdvisory, type AdvisoryInput } from "@/lib/advisories";

export async function postAdvisoryAction(input: AdvisoryInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { viewer, now } = await getContext();
    requireRole(viewer, "STAFF", "ADMIN");
    const a = await createAdvisory(prisma, viewer, input, now);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: a.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function clearAdvisoryAction(id: string): Promise<ActionResult> {
  try {
    const { viewer, now } = await getContext();
    requireRole(viewer, "STAFF", "ADMIN");
    if (typeof id !== "string" || !id) return { ok: false, error: "That advisory doesn't exist." };
    await clearAdvisory(prisma, viewer, id, now);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
