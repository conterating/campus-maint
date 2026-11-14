import "server-only";
import { prisma } from "./db";
import { isStaff, type Viewer } from "./visibility";

export type LocBuilding = {
  id: string;
  name: string;
  code: string;
  kind: string;
  area: string | null;
  spaces: { id: string; label: string; scope: string; floor: number | null; kind: string }[];
  assets: { id: string; name: string; type: string; spaceId: string | null }[];
};

/**
 * Buildings, rooms, and equipment this viewer may report on. Students get public
 * buildings, plus their own hall with only its shared areas and their own room.
 */
export async function reportableLocations(viewer: Viewer): Promise<LocBuilding[]> {
  const buildings = await prisma.building.findMany({
    orderBy: { name: "asc" },
    include: { spaces: { orderBy: [{ floor: "asc" }, { label: "asc" }] }, assets: { orderBy: { name: "asc" } } },
  });
  const staff = isStaff(viewer);
  return buildings
    .filter((b) => staff || b.kind !== "RESIDENCE" || b.id === viewer.residenceBuildingId)
    .map((b) => {
      const spaces = b.spaces.filter((s) => staff || s.scope !== "DORM_ROOM" || s.id === viewer.roomId);
      const spaceIds = new Set(spaces.map((s) => s.id));
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        kind: b.kind,
        area: b.area,
        spaces: spaces.map((s) => ({ id: s.id, label: s.label, scope: s.scope, floor: s.floor, kind: s.kind })),
        assets: b.assets
          .filter((a) => a.spaceId === null || spaceIds.has(a.spaceId))
          .map((a) => ({ id: a.id, name: a.name, type: a.type, spaceId: a.spaceId })),
      };
    });
}

/** Describe a location for the QR prefill banner, even one this viewer can't report on. */
export async function describeLocation(ids: { building?: string; space?: string; asset?: string }) {
  if (!ids.building) return null;
  const building = await prisma.building.findUnique({ where: { id: ids.building } });
  if (!building) return null;
  const space = ids.space ? await prisma.space.findFirst({ where: { id: ids.space, buildingId: building.id } }) : null;
  const asset = ids.asset ? await prisma.asset.findFirst({ where: { id: ids.asset, buildingId: building.id } }) : null;
  return { building, space, asset };
}
