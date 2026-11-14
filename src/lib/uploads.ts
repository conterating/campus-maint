import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

// Photos live outside /public because `next start` only serves files that
// existed at build time. src/app/uploads/[file]/route.ts serves them.

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export { PHOTO_URL_PATTERN } from "./domain";

type Kind = { ext: "jpg" | "png" | "webp" | "gif"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" };

/** Identify an image by its magic bytes, not its claimed type. */
export function sniffImage(buf: Buffer): Kind | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mediaType: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mediaType: "image/png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { ext: "webp", mediaType: "image/webp" };
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return { ext: "gif", mediaType: "image/gif" };
  return null;
}

export async function savePhoto(file: File): Promise<{ url: string; base64: string; mediaType: Kind["mediaType"] }> {
  if (file.size > MAX_PHOTO_BYTES) throw new AppError("That photo is over 5 MB. Try a smaller one.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new AppError("Upload a JPEG, PNG, WebP, or GIF photo.");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${kind.ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return { url: `/uploads/${name}`, base64: buf.toString("base64"), mediaType: kind.mediaType };
}

export async function readPhoto(name: string): Promise<{ buf: Buffer; mediaType: string } | null> {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(name)) return null;
  try {
    const buf = await readFile(path.join(UPLOAD_DIR, name));
    const kind = sniffImage(buf);
    return kind ? { buf, mediaType: kind.mediaType } : null;
  } catch {
    return null;
  }
}
