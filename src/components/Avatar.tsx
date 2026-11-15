export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DIMS = { xs: "size-6 text-[0.75rem]", sm: "size-8 text-[0.9375rem]", md: "size-10 text-[1.0625rem]", lg: "size-12 text-[1.25rem]" } as const;

/** Navy disc, gold initials in the display face. `hue` is accepted for compatibility but unused: one palette. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Avatar({ name, hue, size = "md" }: { name: string; hue?: number; size?: keyof typeof DIMS }) {
  return (
    <span aria-hidden className={`${DIMS[size]} inline-grid shrink-0 place-items-center rounded-full bg-navy font-display font-bold tracking-[0.04em] text-buzz`}>
      {initials(name)}
    </span>
  );
}
