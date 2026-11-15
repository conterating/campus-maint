/** The mark: a navy roundel with a gold check, i.e. "reported, and getting fixed". */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="9" fill="#003057" />
      <path d="M9 16.5l4.6 4.6L23.5 11" fill="none" stroke="#eaaa00" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
