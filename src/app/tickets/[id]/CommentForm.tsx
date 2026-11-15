"use client";

import { useId, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { commentAction } from "@/app/actions";
import { MAX_COMMENT_LENGTH, MAX_COMMENT_PHOTOS } from "@/lib/domain";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";
import { PhotoListPicker, type PickedPhoto } from "@/components/PhotoListPicker";

// Keep the request under the 6 MB server-action limit in next.config.ts.
// Downscaled JPEGs are well under this; large GIFs aren't downscaled.
const MAX_TOTAL_BYTES = 5.5 * 1024 * 1024;

export function CommentForm({ ticketId, audience }: { ticketId: string; audience: string }) {
  const { pending, message, run, setMessage } = useAction();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const textId = useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && photos.length === 0) {
      setMessage({ tone: "error", text: "Write a comment or add a photo first." });
      return;
    }
    if (photos.reduce((sum, p) => sum + p.file.size, 0) > MAX_TOTAL_BYTES) {
      setMessage({ tone: "error", text: "Those photos are too large to send together. Remove one and try again." });
      return;
    }
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("text", text);
    photos.forEach((p) => fd.append("photos", p.file));
    run(() => commentAction(fd), "Comment posted.", () => {
      setText("");
      setPhotos([]);
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 border-t-2 border-navy pt-5">
      <label htmlFor={textId} className="label">
        Add a comment
      </label>
      <textarea
        id={textId}
        className="field min-h-20 resize-y"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Add an update or photo"
        aria-describedby={`${textId}-hint`}
        disabled={pending}
      />
      <p id={`${textId}-hint`} className="hint mt-1">
        {audience}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PhotoListPicker value={photos} onChange={setPhotos} max={MAX_COMMENT_PHOTOS} disabled={pending} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
          Post comment
        </button>
      </div>

      <ActionMessage message={message} />
    </form>
  );
}
