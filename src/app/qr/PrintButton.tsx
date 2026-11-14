"use client";

import { Printer } from "lucide-react";

export function PrintButton({ count }: { count: number }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Printer aria-hidden className="size-4" /> Print {count} labels
    </button>
  );
}
