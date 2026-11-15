"use client";

import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";

const MAX_EDGE = 1600;

/** Shrink a phone photo in the browser before upload. Falls back to the original. */
export async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function PhotoPicker({ value, onChange, disabled }: { value: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const small = await downscale(f);
    setBusy(false);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(small));
    onChange(small);
  }

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onChange(null);
    if (input.current) input.current.value = "";
    input.current?.focus();
  }

  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0])}
        aria-describedby={`${id}-hint`}
      />
      {value && preview ? (
        <div className="overflow-hidden rounded-[8px] ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={preview} alt="Your photo of the problem" className="max-h-72 w-full bg-bg object-cover" />
          <div className="flex items-center justify-between gap-2 bg-surface px-3 py-2">
            <span className="truncate text-sm text-ink-3">{value.name}</span>
            <span className="flex shrink-0 gap-1">
              <label htmlFor={id} className="btn btn-ghost btn-sm cursor-pointer">
                <Camera aria-hidden className="size-4" /> Retake
              </label>
              <button type="button" onClick={clear} className="btn btn-ghost btn-sm" disabled={disabled}>
                <X aria-hidden className="size-4" /> Remove photo
              </button>
            </span>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex cursor-pointer items-center gap-4 rounded-[8px] border border-dashed border-line-2 bg-surface-2 px-4 py-4 transition-colors hover:border-navy hover:bg-navy-50/50 has-[:focus-visible]:border-navy has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-buzz/45"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-surface text-navy shadow-[var(--shadow-xs)] ring-1 ring-line">
            {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ImagePlus aria-hidden className="size-5" />}
          </span>
          <span>
            <span className="block font-bold text-ink">{busy ? "Preparing photo…" : "Add a photo"}</span>
            <span id={`${id}-hint`} className="block text-sm text-ink-3">
              Optional, but it helps the team bring the right parts.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
