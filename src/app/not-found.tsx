import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 pt-20 text-center">
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-full bg-surface text-ink-3 shadow-[var(--shadow-xs)] ring-1 ring-line">
        <SearchX className="size-6" />
      </span>
      <h1 className="h-page mt-5">Page not found</h1>
      <p className="mt-2 text-ink-2">This page or ticket doesn&apos;t exist, or it belongs to a residence hall you don&apos;t live in.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          Go home
        </Link>
        <Link href="/map" className="btn btn-secondary">
          Open the map
        </Link>
      </div>
    </div>
  );
}
