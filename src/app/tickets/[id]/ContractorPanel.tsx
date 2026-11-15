"use client";

import { useId, useState } from "react";
import { CheckCircle2, MessageSquarePlus, Play } from "lucide-react";
import { contractorNoteAction, finishWorkAction, startWorkAction } from "@/app/actions";
import { useAction } from "@/components/useAction";
import { ActionMessage } from "@/components/ActionMessage";
import { PhotoPicker } from "@/components/PhotoPicker";
import { formatDateTime } from "@/lib/format";
import { isOpenStatus } from "@/lib/domain";

/** The assigned contractor's controls: start work, finish with a work log, and public notes. */
export function ContractorPanel({ ticketId, status, working, startedAt, roomTicket }: { ticketId: string; status: string; working: boolean; startedAt: string | null; roomTicket: boolean }) {
  const { pending, message, run } = useAction();
  const id = { startNote: useId(), materials: useId(), cost: useId(), notes: useId(), note: useId() };
  const [startNote, setStartNote] = useState("");
  const [materials, setMaterials] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const open = isOpenStatus(status);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <h2 className="h-section">Your job</h2>
        {working && startedAt && <p className="hint mt-0.5">Working since {formatDateTime(startedAt)}</p>}
        {!open && <p className="mt-2 text-sm text-ink-2">You marked this resolved. The reporter can confirm or reopen it.</p>}
      </div>

      {open && !working && (
        <form
          className="space-y-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => startWorkAction(ticketId, startNote), "Work started. The reporter was notified.", () => setStartNote(""));
          }}
        >
          {roomTicket && <p className="text-sm text-ink-2">This is inside a student&apos;s room. Starting work records when you entered.</p>}
          <div>
            <label htmlFor={id.startNote} className="label">
              Message to the reporter <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <textarea id={id.startNote} className="field min-h-[4rem]" value={startNote} onChange={(e) => setStartNote(e.target.value)} placeholder="e.g. On site now." />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={pending}>
            <Play aria-hidden className="size-4" /> Start work
          </button>
        </form>
      )}

      {open && working && (
        <form
          className="space-y-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("ticketId", ticketId);
            fd.set("materials", materials);
            fd.set("materialsCost", cost);
            fd.set("notes", notes);
            if (photo) fd.set("photo", photo);
            run(() => finishWorkAction(fd), "Marked resolved. The reporter can confirm the fix.");
          }}
        >
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 aria-hidden className="size-4 text-ink-3" /> Finish the job
          </h3>
          <div>
            <label htmlFor={id.materials} className="label">
              Materials used <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input id={id.materials} className="field" value={materials} onChange={(e) => setMaterials(e.target.value)} />
          </div>
          <div>
            <label htmlFor={id.cost} className="label">
              Materials cost in dollars <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <input id={id.cost} className="field num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor={id.notes} className="label">
              What you did
            </label>
            <textarea id={id.notes} className="field min-h-[4.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shown to the reporter." />
          </div>
          <div>
            <p className="label">Completion photo (optional)</p>
            <PhotoPicker value={photo} onChange={setPhoto} disabled={pending} />
          </div>
          <button type="submit" className="btn btn-success w-full" disabled={pending}>
            Finish and mark resolved
          </button>
        </form>
      )}

      {open && (
        <form
          className="space-y-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => contractorNoteAction(ticketId, note), "Note posted. The reporter can see it.", () => setNote(""));
          }}
        >
          <label htmlFor={id.note} className="flex items-center gap-2 text-sm font-bold">
            <MessageSquarePlus aria-hidden className="size-4 text-ink-3" /> Add a public note
          </label>
          <textarea id={id.note} className="field min-h-[4rem]" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={pending || note.trim().length < 2}>
            Post note
          </button>
        </form>
      )}
      <div className="px-4 pb-1 [&_p]:mb-4">
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
