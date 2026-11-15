// Campus wall-clock helpers (America/New_York). Pure.
export const CAMPUS_TZ = "America/New_York";
export const MIN = 60_000;
export const DAY_MS = 86_400_000;

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TZ,
  hourCycle: "h23",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function campusParts(ms: number): { dow: number; minuteOfDay: number; secondsIntoDay: number } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  return { dow: DOW[p.weekday] ?? 0, minuteOfDay: h * 60 + Number(p.minute), secondsIntoDay: h * 3600 + Number(p.minute) * 60 + Number(p.second) };
}

/** Midnight (campus time) at the start of the day containing `ms`, correct on DST change days too. */
export function campusDayStart(ms: number): number {
  let c = ms - campusParts(ms).secondsIntoDay * 1000;
  for (let i = 0; i < 2; i++) {
    const p = campusParts(c).secondsIntoDay;
    if (p === 0) break;
    // Landed an hour either side of midnight because the clocks changed in between.
    c += (p > 12 * 3600 ? 86_400 - p : -p) * 1000;
  }
  return c;
}

/** Midnight of the campus day `i` days after the day containing `base`. The one place day offsets are computed (DST-safe). */
export function campusDayAt(base: number, i: number): number {
  return campusDayStart(campusDayStart(base) + i * DAY_MS + 12 * 60 * MIN);
}

/** The instant at wall-clock `minuteOfDay` (campus time) on the campus day starting at `dayStart`. */
export function campusTimeOn(dayStart: number, minuteOfDay: number): number {
  const t = dayStart + minuteOfDay * MIN;
  const drift = minuteOfDay - campusParts(t).minuteOfDay;
  return Math.abs(drift) <= 120 ? t + drift * MIN : t; // only a DST change shifts the wall clock; 24:00 is the next midnight
}

const clockFmt = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TZ, weekday: "short", month: "short", day: "numeric" });
export const formatClock = (d: Date | number) => clockFmt.format(d);
export const formatDay = (d: Date | number) => dayFmt.format(d);

/** "7:00 AM" for 420. */
export function minuteLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
