"use client";

import { CheckCheck } from "lucide-react";
import { markNotificationsRead } from "@/app/actions";
import { useAction } from "@/components/useAction";

export function MarkAllRead() {
  const { pending, run } = useAction();
  return (
    <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => markNotificationsRead())}>
      <CheckCheck aria-hidden className="size-4" /> Mark all as read
    </button>
  );
}
