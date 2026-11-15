import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";

import { get, put } from "@vercel/blob";

// Where photos are kept:
//   Locally: the uploads/ folder. They live outside /public because
//     `next start` only serves files that existed at build time.
//   On Vercel: Vercel Blob, when a Blob store is connected to the project.
//     Newer stores set BLOB_STORE_ID, and @vercel/blob logs in with the OIDC
//     token Vercel provides at runtime; older ones set BLOB_READ_WRITE_TOKEN.
//     Either one turns Blob on. Vercel's filesystem is read-only and not
//     shared between requests, so the folder can't work there.
//
// Either way the app links to /uploads/<uuid>.<ext> and
// src/app/uploads/[file]/route.ts serves the bytes, so stored URLs, the URL
// check and the photo tags look the same in both places.
//
// The Blob store should be created as Private (the default here). Photos are
// then only reachable through our route, never by a public Blob URL. Set
// BLOB_ACCESS=public only if the store was created as public.

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function blobAccess(): "private" | "public" | null {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

const blobPath = (name: string) => `uploads/${name}`;
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
  const name = `${randomUUID()}.${kind.ext}`;
  const access = blobAccess();
  if (access) {
    await put(blobPath(name), buf, { access, contentType: kind.mediaType, addRandomSuffix: false });
  } else {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, name), buf);
  }
  return { url: `/uploads/${name}`, base64: buf.toString("base64"), mediaType: kind.mediaType };
}

async function readBytes(name: string): Promise<Buffer | null> {
  const access = blobAccess();
  if (!access) return readFile(path.join(UPLOAD_DIR, name));
  const res = await get(blobPath(name), { access });
  if (!res || res.statusCode !== 200) return null;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export async function readPhoto(name: string): Promise<{ buf: Buffer; mediaType: string } | null> {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(name)) return null;
  try {
    const buf = await readBytes(name);
    if (!buf) return null;
    const kind = sniffImage(buf);
    return kind ? { buf, mediaType: kind.mediaType } : null;
  } catch {
    return null;
  }
}
