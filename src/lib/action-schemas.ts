import { z } from "zod";
import { AppError } from "./errors";

// Shape and size checks for server-action input. Server actions are public
// HTTP endpoints, so every argument is validated here regardless of what the
// form allows. The services still enforce who may do what.

export const ID = z.string().min(1).max(64);
const OPT_ID = ID.nullish().transform((v) => v ?? null);
export const TEXT = z.string().max(2000);
const TAG = z.string().max(40);

export const schemas = {
  id: ID,
  ids: z.array(ID).max(200).optional(),
  reason: TEXT,
  follow: z.boolean(),
  availability: TAG,
  submitReport: z.object({
    buildingId: ID,
    spaceId: OPT_ID,
    assetId: OPT_ID,
    description: z.string().max(2000),
    photoUrl: z.string().max(200).nullable(),
    category: TAG,
    severity: TAG,
    // The service truncates to 120; allow a little slack so an AI summary isn't rejected.
    summary: z.string().max(300),
    token: z.string().max(4000),
  }),
  staffStatus: z.object({ status: TAG, note: TEXT.nullish(), assigneeId: ID.nullish() }),
  reassign: z.object({ department: TAG, reason: TEXT.nullish() }),
  override: z.object({ category: TAG.nullish(), severity: TAG.nullish(), summary: z.string().max(120).nullish(), reason: TEXT.nullish() }),
  note: z.object({ text: TEXT, internal: z.boolean() }),
  assign: z.object({ assigneeId: ID, note: TEXT.nullish() }),
  optNote: TEXT.nullish(),
  residence: z.object({
    userId: ID,
    decision: z.enum(["verify", "reject", "edit"]),
    residenceBuildingId: ID.nullish(),
    roomId: ID.nullish(),
  }),
};

/** Parse or throw an AppError with a generic message (never the zod details). */
export function check<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError("Check the form and try again.");
  return r.data;
}
