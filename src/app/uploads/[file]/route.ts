import { prisma } from "@/lib/db";
import { getSessionState } from "@/lib/session";
import { canSeePhoto } from "@/lib/photo-access";
import { readPhoto } from "@/lib/uploads";

// Photos are served only to signed-in people who can see the ticket they belong
// to. Missing and forbidden look the same.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const state = await getSessionState();
  if (state.status !== "ok" || !(await canSeePhoto(prisma, state.viewer, file))) return new Response("Not found", { status: 404 });
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
