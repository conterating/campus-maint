export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const DIMS = { xs: "size-6 text-[0.625rem]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" } as const;

export function Avatar({ name, hue = 210, size = "md" }: { name: string; hue?: number; size?: keyof typeof DIMS }) {
  return (
    <span
      aria-hidden
      className={`${DIMS[size]} inline-grid shrink-0 place-items-center rounded-full font-bold ring-1 ring-inset ring-black/5`}
      style={{ background: `hsl(${hue} 60% 92%)`, color: `hsl(${hue} 55% 26%)` }}
    >
      {initials(name)}
    </span>
  );
}
