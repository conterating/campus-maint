import "server-only";
import { prisma } from "./db";
import { HOUSING_AREA_LABEL, type HousingArea } from "./domain";

export type HallOption = { id: string; name: string; group: string; rooms: { id: string; label: string }[] };

/** Residence halls and their rooms, for the sign-up and account forms. */
export async function residenceOptions(): Promise<HallOption[]> {
  const halls = await prisma.building.findMany({
    where: { kind: "RESIDENCE" },
    include: { spaces: { where: { scope: "DORM_ROOM" }, select: { id: true, label: true, floor: true }, orderBy: [{ floor: "asc" }, { label: "asc" }] } },
    orderBy: { name: "asc" },
  });
  return halls.map((h) => ({
    id: h.id,
    name: h.name,
    group: HOUSING_AREA_LABEL[h.area as HousingArea] ?? "Residence halls",
    rooms: h.spaces.map((s) => ({ id: s.id, label: s.label })),
  }));
}
