// Empty states with a bit of personality: a small line drawing from the
// work-order world, a short title, and one helpful line.

type Art = "tag" | "clipboard" | "toolbox" | "pin";

const NAVY = "#003057";
const GOLD = "#eaaa00";
const TAG = "#f3ebcf";

function Drawing({ art }: { art: Art }) {
  const common = { stroke: NAVY, strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (art) {
    case "tag":
      // A blank work-order tag hanging from a nail.
      return (
        <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
          <path d="M60 10v14" fill="none" {...common} />
          <circle cx="60" cy="10" r="3.5" fill={NAVY} />
          <path d="M60 24 L48 40" fill="none" {...common} />
          <path d="M60 24 L72 40" fill="none" {...common} />
          <g transform="rotate(-6 60 75)">
            <path d="M40 40h40a4 4 0 0 1 4 4v58a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4V44a4 4 0 0 1 4-4z" {...common} fill={TAG} />
            <circle cx="60" cy="50" r="4" {...common} fill="#fff" />
            <path d="M45 66h30M45 76h30M45 86h18" stroke={NAVY} strokeOpacity=".28" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M45 96h30" stroke={GOLD} strokeWidth="3" strokeDasharray="3 4" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "clipboard":
      // A clipboard with every line checked off.
      return (
        <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
          <rect x="30" y="18" width="60" height="88" rx="5" {...common} fill="#fff" />
          <rect x="46" y="12" width="28" height="12" rx="3" {...common} fill={GOLD} />
          {[42, 60, 78].map((y) => (
            <g key={y}>
              <path d={`M40 ${y}l4 4 7-8`} stroke="#0b6b3a" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d={`M57 ${y + 1}h22`} stroke={NAVY} strokeOpacity=".3" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          ))}
          <path d="M40 96h40" stroke={NAVY} strokeOpacity=".15" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "toolbox":
      // A closed toolbox: nothing to show yet.
      return (
        <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
          <path d="M46 44v-8a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v8" fill="none" {...common} />
          <rect x="22" y="44" width="76" height="52" rx="5" {...common} fill={TAG} />
          <path d="M22 62h76" fill="none" {...common} />
          <rect x="52" y="56" width="16" height="12" rx="2" {...common} fill={GOLD} />
        </svg>
      );
    case "pin":
      // A map pin over an empty tag.
      return (
        <svg viewBox="0 0 120 120" className="size-28" aria-hidden>
          <path d="M28 86h64" stroke={NAVY} strokeOpacity=".25" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 6" />
          <path d="M60 22c-12 0-21 9-21 21 0 16 21 37 21 37s21-21 21-37c0-12-9-21-21-21z" {...common} fill={GOLD} />
          <circle cx="60" cy="43" r="7" {...common} fill="#fff" />
        </svg>
      );
  }
}

export function EmptyState({ art, title, children, action }: { art: Art; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Drawing art={art} />
      <p className="mt-4 font-display text-[1.75rem] font-extrabold uppercase leading-none text-navy">{title}</p>
      {children && <p className="mt-2 max-w-sm text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
