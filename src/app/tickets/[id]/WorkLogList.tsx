import { formatDateTime } from "@/lib/format";

export type WorkLogView = {
  id: string;
  who: string;
  startedAt: Date;
  endedAt: Date | null;
  minutes: number | null;
  roomEnteredAt: Date | null;
  roomExitedAt: Date | null;
  materials: string | null;
  notes: string | null;
  completionPhotoUrl: string | null;
  /** Only for admins and the contractor's own entries. */
  costs: { materials: number | null; labor: number | null } | null;
};

export const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);
const duration = (m: number | null) => (m == null ? "In progress" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`);

export function WorkLogList({ logs }: { logs: WorkLogView[] }) {
  return (
    <ul className="mt-3 divide-y divide-line">
      {logs.map((w) => (
        <li key={w.id} className="py-3 text-sm">
          <p className="font-bold text-ink">
            {w.who} · {duration(w.minutes)}
          </p>
          <p className="text-ink-2">
            {formatDateTime(w.startedAt)} – {w.endedAt ? formatDateTime(w.endedAt) : "now"}
            {w.roomEnteredAt && (
              <>
                {" "}
                · entered the room {formatDateTime(w.roomEnteredAt)}
                {w.roomExitedAt ? `, left ${formatDateTime(w.roomExitedAt)}` : ""}
              </>
            )}
          </p>
          {w.materials && <p className="mt-1 text-ink-2">Materials: {w.materials}</p>}
          {w.costs && (
            <p className="mt-1 text-ink-2">
              Materials {money(w.costs.materials)} · Labor {money(w.costs.labor)}
            </p>
          )}
          {w.notes && <p className="mt-1 text-ink">{w.notes}</p>}
          {w.completionPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- served by the permission-checked uploads route
            <img src={w.completionPhotoUrl} alt="Completion photo" className="mt-2 max-h-48 rounded-lg ring-1 ring-line" />
          )}
        </li>
      ))}
    </ul>
  );
}
