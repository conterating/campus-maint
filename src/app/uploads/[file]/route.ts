import { readPhoto } from "@/lib/uploads";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const photo = await readPhoto(file);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.buf), {
    headers: {
      "Content-Type": photo.mediaType,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
