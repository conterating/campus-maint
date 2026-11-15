// Work-order building blocks: the stamped number, ruled field cells, the
// manila "filed" tag, and location text without repeated words.

/**
 * Location without repeats: "Room 1443 · Room 1443 projector" becomes
 * "Room 1443 projector". Returns the building and the spot inside it.
 */
export function placeParts(building: string, space?: string | null, asset?: string | null): { building: string; spot: string | null } {
  const s = space?.trim() || null;
  const a = asset?.trim() || null;
  let spot: string | null;
  if (s && a) spot = a.toLowerCase().includes(s.toLowerCase()) ? a : `${s}, ${a}`;
  else spot = a ?? s;
  return { building, spot };
}

export function placeText(building: string, space?: string | null, asset?: string | null): string {
  const p = placeParts(building, space, asset);
  return p.spot ? `${p.building}, ${p.spot}` : p.building;
}

/** The ticket number, set like a rubber stamp. `animate` plays the stamp press. */
export function Stamp({ number, size = "lg", animate = false, delayMs = 0, className = "" }: { number: string; size?: "lg" | "md" | "sm"; animate?: boolean; delayMs?: number; className?: string }) {
  const dims =
    size === "lg" ? "t-stamp px-[0.12em] pt-[0.1em] pb-[0.04em] border-[0.055em]" : size === "md" ? "font-display font-extrabold text-[2.5rem] leading-[0.85] px-2 pt-1.5 pb-0.5 border-[3px]" : "font-display font-extrabold text-xl leading-none px-1.5 pt-1 pb-0.5 border-2";
  return (
    <span
      className={`inline-block origin-center rounded-[0.08em] border-current text-navy num ${dims} ${animate ? "anim-stamp" : ""} ${className}`}
      style={animate ? { animationDelay: `${delayMs}ms` } : undefined}
    >
      {number}
    </span>
  );
}

/** One labeled cell on the work-order header grid. */
export function WoField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 border-t border-line-2 pt-2.5 ${className}`}>
      <dt className="wo-label">{label}</dt>
      <dd className="mt-1 min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/**
 * The signature moment after filing a report: a manila work-order tag swings
 * in, the category is typed onto it, and the number is stamped. ~1.1s total,
 * in the normal page flow, so nothing waits on it.
 */
export function FiledTag({ number, category, department }: { number: string; category: string; department: string }) {
  return (
    <div role="status" className="wo-tag anim-tag-in w-full max-w-xl overflow-hidden px-6 pb-5 pt-12 sm:px-8 sm:pt-6 sm:pl-16">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-tag-ink/80">Work order · Filed</p>
          <p className="anim-type-on mt-1 font-display text-[1.75rem] font-extrabold uppercase leading-none text-tag-ink" style={{ animationDelay: "340ms" }}>
            {category}
          </p>
          <p className="mt-1.5 text-[0.9375rem] text-tag-ink/90">Sent to {department}</p>
        </div>
        <Stamp number={number} size="md" animate delayMs={640} className="bg-tag" />
      </div>
      <p className="wo-perf mt-4 pt-3 text-[0.9375rem] text-tag-ink">
        <span className="font-bold">
          Filed as <span className="num">{number}</span>.
        </span> You&apos;ll get an alert every time it changes.
      </p>
    </div>
  );
}

/** Running text with ticket IDs ("RR-1061") set in the stamp face, so zeros read as zeros. */
export function IdText({ text }: { text: string }) {
  const parts = text.split(/(RR-\d+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^RR-\d+$/.test(p) ? (
          <span key={i} className="num text-[1.06em]">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}
