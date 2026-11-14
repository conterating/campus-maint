"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/errors";

/** Run a server action with pending state and an accessible status message. */
export function useAction() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function run<T>(fn: () => Promise<ActionResult<T>>, success?: string | ((data: T) => string), after?: (data: T) => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      if (success) setMessage({ tone: "ok", text: typeof success === "function" ? success(res.data) : success });
      after?.(res.data);
    });
  }

  return { pending, message, run, setMessage };
}
