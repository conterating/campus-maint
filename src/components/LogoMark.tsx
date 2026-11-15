/** The mark: a work-order tag with a check on it, i.e. "reported, and getting fixed". */
export function LogoMark({ className = "size-8", onNavy = false }: { className?: string; onNavy?: boolean }) {
  const body = onNavy ? "#eaaa00" : "#003057";
  const ink = onNavy ? "#003057" : "#eaaa00";
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <path d="M11 4h17a2.5 2.5 0 0 1 2.5 2.5v19A2.5 2.5 0 0 1 28 28H11L2.5 16z" fill={body} />
      <circle cx="9" cy="16" r="2.2" fill={onNavy ? "#003057" : "#fff"} />
      <path d="M14.5 16.5l3.6 3.6L26 11.5" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="square" />
    </svg>
  );
}

/** The wordmark lockup used in both headers: tag + "RAMBLIN' REPAIRS" on navy. */
export function Wordmark() {
  return (
    <>
      <LogoMark onNavy className="size-8" />
      <span className="font-display text-[1.5rem] font-extrabold uppercase leading-none tracking-[0.01em] text-white">
        Ramblin’<span className="ml-1.5 text-buzz">Repairs</span>
      </span>
      <span className="sr-only"> home</span>
    </>
  );
}
