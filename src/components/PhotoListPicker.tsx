"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { downscale } from "./PhotoPicker";

export type PickedPhoto = { file: File; preview: string };

/**
 * Pick several photos (up to `max`), each downscaled in the browser like the
 * report form's single photo. Unlike PhotoPicker it doesn't force the camera,
 * so people can attach pictures they already took.
 */
export function PhotoListPicker({
  value,
  onChange,
  max,
  disabled,
}: {
  value: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Release object URLs for photos that leave the list (and all of them on unmount).
  const latest = useRef(value);
  useEffect(() => {
    const prev = latest.current;
    latest.current = value;
    prev.filter((p) => !value.includes(p)).forEach((p) => URL.revokeObjectURL(p.preview));
  }, [value]);
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    const room = max - value.length;
    const chosen = [...files].slice(0, room);
    setNote(files.length > room ? `Only ${max} photos fit on one comment, so ${files.length - room} ${files.length - room === 1 ? "was" : "were"} left out.` : null);
    setBusy(true);
    const small = await Promise.all(chosen.map(downscale));
    setBusy(false);
    onChange([...value, ...small.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (input.current) input.current.value = "";
  }

  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i));
    setNote(null);
    input.current?.focus();
  }

  const full = value.length >= max;

  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
        className="sr-only"
        disabled={disabled || full || busy}
        onChange={(e) => add(e.target.files)}
        aria-describedby={`${id}-hint`}
      />

      {value.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2" aria-label="Photos to attach">
          {value.map((p, i) => (
            <li key={p.preview} className="relative overflow-hidden rounded-[4px] ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={p.preview} alt={`Photo ${i + 1} to attach`} className="aspect-square w-full bg-bg object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-ink/75 text-white hover:bg-ink"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={id}
        className={`btn btn-ghost btn-sm ${full || disabled ? "pointer-events-none opacity-50" : "cursor-pointer"} has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-buzz/45`}
        aria-disabled={full || disabled || undefined}
      >
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImagePlus aria-hidden className="size-4" />}
        {busy ? "Preparing photos…" : value.length ? "Add another photo" : "Add photos"}
      </label>
      <span id={`${id}-hint`} className="ml-2 text-sm text-ink-3">
        {value.length} of {max}
      </span>
      {note && (
        <p role="status" className="hint mt-1">
          {note}
        </p>
      )}
    </div>
  );
}
