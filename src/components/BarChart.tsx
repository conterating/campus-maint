// Horizontal single-series bar chart in plain HTML. One hue (validated against
// the white surface), values in ink beside each bar, a hover tooltip per bar, and
// a table view for screen readers and anyone who prefers numbers.

export const CHART_BAR = "#003057";

export type BarRow = { key: string; label: string; value: number | null; valueLabel: string; detail: string };

export function BarChart({ title, description, rows, max, unit, limit }: { title: string; description: string; rows: BarRow[]; max?: number; unit: string; limit?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  const shown = limit ? rows.slice(0, limit) : rows;
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return (
    <figure className="card p-5" aria-labelledby={`${id}-title`}>
      <figcaption>
        <h2 id={`${id}-title`} className="h-section">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-ink-3">{description}</p>
      </figcaption>
      <ul className="mt-5 space-y-[2px]" aria-hidden>
        {shown.map((r) => {
          const pct = r.value === null ? 0 : Math.max(0.6, (r.value / top) * 100);
          return (
            <li key={r.key} className="group relative grid grid-cols-[minmax(6.5rem,36%)_1fr_4.75rem] items-center gap-3 rounded-md py-1.5">
              <span className="truncate text-sm text-ink-2" title={r.label}>
                {r.label}
              </span>
              <span className="relative h-2.5 rounded-full bg-[#eef1f5]">
                {r.value !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: CHART_BAR }} />}
              </span>
              <span className="whitespace-nowrap text-right text-sm font-bold tabular-nums text-ink">{r.valueLabel}</span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/3 top-full z-10 mt-0.5 hidden w-max max-w-64 rounded-[8px] bg-ink px-3 py-2 text-xs text-white shadow-[var(--shadow-lg)] group-hover:block"
              >
                <span className="block font-bold">{r.label}</span>
                {r.detail}
              </span>
            </li>
          );
        })}
      </ul>
      <details className="mt-4 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-bold text-ink-2 hover:text-ink">{shown.length < rows.length ? `Show all ${rows.length} as a table` : "Show as a table"}</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead className="text-xs text-ink-3">
            <tr>
              <th scope="col" className="py-1 font-bold">
                Name
              </th>
              <th scope="col" className="py-1 text-right font-bold">
                {unit}
              </th>
              <th scope="col" className="py-1 pl-3 font-bold">
                Detail
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-1.5 font-normal text-ink">
                  {r.label}
                </th>
                <td className="num py-1.5 text-right">{r.valueLabel}</td>
                <td className="py-1.5 pl-3 text-ink-3">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="sr-only">{rows.map((r) => `${r.label}: ${r.valueLabel}`).join(". ")}</p>
    </figure>
  );
}
