/** The mark: a navy square with a gold check, i.e. "reported, and getting fixed". Gold on navy backgrounds. */
export function LogoMark({ className = "size-8", onNavy = false }: { className?: string; onNavy?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="5" fill={onNavy ? "#eaaa00" : "#003057"} />
      <path d="M9 16.5l4.6 4.6L23.5 11" fill="none" stroke={onNavy ? "#003057" : "#eaaa00"} strokeWidth="3.6" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}
