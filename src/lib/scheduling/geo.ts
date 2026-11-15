// Distances and travel time on campus. Pure.

export type LatLng = { lat: number; lng: number };

/** Walking speed (m/s) and how much longer a real path is than the straight line. */
export const WALK_SPEED_MPS = 1.25;
export const PATH_FACTOR = 1.4;
export const MIN_TRAVEL_MINUTES = 5;
/** Fixed pause between two jobs (wrap up, grab tools, find the room). */
export const BUFFER_MINUTES = 10;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole minutes to get between two points (at least 5). 0 when the start is unknown. */
export function travelMinutes(from: LatLng | null | undefined, to: LatLng | null | undefined): number {
  if (!from || !to) return 0;
  const seconds = (haversineMeters(from, to) * PATH_FACTOR) / WALK_SPEED_MPS;
  return Math.max(MIN_TRAVEL_MINUTES, Math.ceil(seconds / 60));
}
