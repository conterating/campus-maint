import "server-only";
import { prisma } from "./db";

// The demo clock. Real time plus an offset stored in the database, so the
// "fast forward" control affects every request and every server process.

const KEY = "clockOffsetMs";

export async function getClockOffsetMs(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export async function now(): Promise<Date> {
  return new Date(Date.now() + (await getClockOffsetMs()));
}

export async function advanceClock(ms: number): Promise<number> {
  if (!Number.isFinite(ms) || ms < 0) throw new Error("Can only fast-forward by a positive amount");
  const next = (await getClockOffsetMs()) + ms;
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: String(next) },
    update: { value: String(next) },
  });
  return next;
}

export async function resetClock(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: KEY } });
}
