import type { Building, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { normalizeRoomNumber } from "./auth-schemas";

/** The number part of a room label: "Room 214" → "214", "Apartment 504" → "504". */
export function roomNumberOf(label: string): string {
  return normalizeRoomNumber(label.replace(/^(room|apartment|suite)\s+/i, ""));
}

/**
 * The DORM_ROOM in this hall with this number. Students type their room number
 * at sign-up; if Housing's list doesn't have it yet, the room is added to the
 * hall (labelled like the hall's other rooms). Either way the student's
 * residence stays unverified until Housing confirms it, so typing a number
 * never grants access to anyone else's room.
 */
export async function findOrCreateRoom(db: PrismaClient, hall: Building, rawNumber: string) {
  const number = normalizeRoomNumber(rawNumber);
  if (!number) return null;
  const rooms = await db.space.findMany({ where: { buildingId: hall.id, scope: "DORM_ROOM" } });
  const existing = rooms.find((r) => roomNumberOf(r.label) === number);
  if (existing) return existing;

  const prefix = rooms[0]?.label.match(/^(Room|Apartment|Suite)\b/i)?.[1] ?? "Room";
  const floorGuess = /^\d{3,4}/.test(number) ? Number(number.slice(0, number.length - 2)) : null;
  const floor = floorGuess !== null && floorGuess >= 0 && floorGuess <= hall.floors ? floorGuess : null;
  return db.space.create({
    data: {
      id: `s-${hall.code.toLowerCase()}-u${randomBytes(4).toString("hex")}`,
      buildingId: hall.id,
      floor,
      label: `${prefix} ${number}`,
      scope: "DORM_ROOM",
      kind: "room",
    },
  });
}
