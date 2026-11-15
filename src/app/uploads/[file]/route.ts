import { prisma } from "@/lib/db";
import { getSessionState } from "@/lib/session";
import { canView } from "@/lib/visibility";
import { readPhoto } from "@/lib/uploads";

// Photos are served only to signed-in people who can see the ticket they belong
// to (a report photo, or a contractor's completion photo). Missing and
// forbidden look the same.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const state = await getSessionState();
  if (state.status !== "ok") return new Response("Not found", { status: 404 });
  const url = `/uploads/${file}`;

  const ticket =
    (await prisma.ticket.findFirst({ where: { photoUrl: url } })) ??
    (await prisma.workLog.findFirst({ where: { completionPhotoUrl: url }, include: { ticket: true } }))?.ticket ??
    null;
  // A photo not attached to a ticket yet (between "analyze" and "submit") is only
  // reachable by whoever uploaded it, who already has its URL; staff can see it too.
  if (ticket ? !canView(state.viewer, ticket) : state.viewer.role === "CONTRACTOR") return new Response("Not found", { status: 404 });

  const photo = await readPhoto(file);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.buf), {
    headers: {
      "Content-Type": photo.mediaType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
