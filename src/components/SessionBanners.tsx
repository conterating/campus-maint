"use client";

import { useRouter } from "next/navigation";
import { Eye, Home } from "lucide-react";
import { stopImpersonating } from "@/app/actions";
import { useAction } from "./useAction";

/** Demo mode: an admin is viewing the app as someone else. */
export function ImpersonationBanner({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <div role="status" className="no-print bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <Eye aria-hidden className="size-4" />
        <p className="font-bold">
          Viewing as {name} ({role})
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => stopImpersonating(), undefined, (d) => router.push(d.home))}
          className="ml-auto min-h-8 rounded-[4px] bg-buzz px-3 font-bold text-navy hover:bg-buzz-50"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

export function ResidenceBanner() {
  return (
    <div role="status" className="no-print border-b border-buzz/50 bg-buzz-50">
      <p className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 text-sm font-bold text-ink">
        <Home aria-hidden className="size-4 shrink-0 text-gold-ink" />
        Housing is confirming your room. Until then you can report issues in public buildings.
      </p>
    </div>
  );
}
