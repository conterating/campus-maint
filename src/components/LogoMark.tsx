import Image from "next/image";

/**
 * The mark: Buzz in a hard hat with a wrench on a gold hexagon (from the
 * "Campus Maintenance Logo" sheet). On navy we use the borderless "reversed"
 * hexagon; on light surfaces, the one with the navy border. Decorative: the
 * wordmark or surrounding text names the app. Size it by height, e.g. "h-10".
 */
export function LogoMark({ className = "h-8", onNavy = false }: { className?: string; onNavy?: boolean }) {
  return (
    <Image
      src={onNavy ? "/brand/logo-hex.png" : "/brand/logo-hex-bordered.png"}
      alt=""
      aria-hidden
      width={222}
      height={256}
      className={`${className} w-auto shrink-0`}
    />
  );
}

/** The header lockup: hexagon + "RAMBLIN' REPAIRS", scaled down on narrow phones. */
export function Wordmark() {
  return (
    <>
      <LogoMark onNavy className="h-9 sm:h-11" />
      {/* Under 375px there isn't room beside the bell and menu: show just the badge (the name stays for screen readers). */}
      <span className="font-display text-[1.25rem] font-extrabold uppercase leading-none tracking-[0.01em] text-white max-[374px]:sr-only min-[400px]:text-[1.375rem] sm:text-[1.5rem]">
        Ramblin’<span className="ml-1 text-buzz sm:ml-1.5">Repairs</span>
      </span>
      <span className="sr-only"> home</span>
    </>
  );
}
