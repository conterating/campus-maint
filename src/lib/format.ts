// Display helpers. Pure: safe on client and server. All take `now` explicitly so
// the demo clock stays authoritative.

export function relativeTime(date: Date | string, now: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const n = typeof now === "string" ? new Date(now) : now;
  const diff = n.getTime() - d.getTime();
  const future = diff < 0;
  const mins = Math.round(Math.abs(diff) / 60000);
  let text: string;
  if (mins < 1) return "just now";
  if (mins < 60) text = `${mins} min`;
  else if (mins < 60 * 24) text = `${Math.round(mins / 60)} hr`;
  else if (mins < 60 * 24 * 30) {
    const days = Math.round(mins / 1440);
    text = `${days} day${days === 1 ? "" : "s"}`;
  } else {
    const months = Math.round(mins / 43200);
    text = `${months} month${months === 1 ? "" : "s"}`;
  }
  return future ? `in ${text}` : `${text} ago`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export function formatDateTime(date: Date | string): string {
  return dateFmt.format(typeof date === "string" ? new Date(date) : date);
}
