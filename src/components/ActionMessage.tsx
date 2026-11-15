import { AlertCircle, CheckCircle2 } from "lucide-react";

/** Polite live region for action results. Rendered even when empty so screen readers pick up changes. */
export function ActionMessage({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  return (
    <div aria-live="polite" role="status">
      {message && (
        <p
          className={`rise mt-3 flex items-start gap-2 border-l-4 py-1 pl-3 text-[0.9375rem] font-bold ${message.tone === "ok" ? "border-st-fixed text-st-fixed" : "border-emergency text-emergency"}`}
        >
          {message.tone === "ok" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
          {message.text}
        </p>
      )}
    </div>
  );
}
