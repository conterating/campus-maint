import { AlertCircle, CheckCircle2 } from "lucide-react";

/** Polite live region for action results. Rendered even when empty so screen readers pick up changes. */
export function ActionMessage({ message }: { message: { tone: "ok" | "error"; text: string } | null }) {
  return (
    <div aria-live="polite" role="status">
      {message && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-[5px] px-3 py-2.5 text-sm font-bold ring-1 ring-inset ${
            message.tone === "ok" ? "bg-[#ecfdf3] text-resolved ring-resolved/20" : "bg-emergency-bg text-emergency ring-emergency/20"
          }`}
        >
          {message.tone === "ok" ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
          {message.text}
        </p>
      )}
    </div>
  );
}
