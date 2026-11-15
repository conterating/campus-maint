import type { PrismaClient } from "@prisma/client";

const DAY = 86_400_000;

/** One active WARNING and one recently cleared advisory, posted by the first staff account. */
export async function seedAdvisories(db: PrismaClient, now: Date): Promise<void> {
  const author = (await db.user.findFirst({ where: { role: "STAFF" }, orderBy: { id: "asc" } })) ?? (await db.user.findFirst({ where: { role: "ADMIN" } }));
  if (!author) return;
  const center = await db.building.findFirst({ where: { kind: "STUDENT_CENTER" } });
  await db.advisory.createMany({
    data: [
      {
        title: "Avoid Ferst Drive near the Student Center",
        message: "Facilities is repairing a water main. The road and sidewalk are closed. Use the Skiles walkway to get across campus.",
        severity: "WARNING",
        buildingId: center?.id ?? null,
        area: "Ferst Drive near the Student Center",
        startsAt: new Date(now.getTime() - 3 * 3_600_000),
        endsAt: new Date(now.getTime() + 1 * DAY),
        createdById: author.id,
        createdAt: new Date(now.getTime() - 3 * 3_600_000),
      },
      {
        title: "Elevator outage at the Library",
        message: "Both elevators were out of service. Service has been restored.",
        severity: "INFO",
        area: "Price Gilbert Library",
        startsAt: new Date(now.getTime() - 3 * DAY),
        clearedAt: new Date(now.getTime() - 2 * DAY),
        createdById: author.id,
        createdAt: new Date(now.getTime() - 3 * DAY),
      },
    ],
  });
}
