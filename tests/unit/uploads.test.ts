// Photo storage: the local folder by default, Vercel Blob when a Blob token is set.
// Blob is replaced by an in-memory fake, so this runs offline.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, { body: Buffer; access: string; contentType?: string }>();

vi.mock("@vercel/blob", () => ({
  put: vi.fn(async (pathname: string, body: Buffer, opts: { access: string; contentType?: string; addRandomSuffix?: boolean }) => {
    store.set(pathname, { body, access: opts.access, contentType: opts.contentType });
    return { pathname, url: `https://fake.blob/${pathname}` };
  }),
  get: vi.fn(async (pathname: string, opts: { access: string }) => {
    const hit = store.get(pathname);
    if (!hit || hit.access !== opts.access) return null;
    return { statusCode: 200, stream: new Blob([new Uint8Array(hit.body)]).stream(), headers: new Headers(), blob: {} };
  }),
}));

const { savePhoto, readPhoto } = await import("@/lib/uploads");
const { put } = await import("@vercel/blob");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
const file = (buf: Buffer, name = "p.png") => new File([new Uint8Array(buf)], name, { type: "image/png" });

describe("photo storage on Vercel Blob", () => {
  beforeEach(() => {
    store.clear();
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_fake");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(put).mockClear();
  });

  it("stores a photo privately under uploads/ and serves it back through our own URL", async () => {
    const saved = await savePhoto(file(PNG));
    expect(saved.url).toMatch(/^\/uploads\/[a-f0-9-]{36}\.png$/);
    const name = saved.url.split("/").pop()!;
    expect(store.get(`uploads/${name}`)).toMatchObject({ access: "private", contentType: "image/png" });
    expect(vi.mocked(put).mock.calls[0][2]).toMatchObject({ addRandomSuffix: false });

    const read = await readPhoto(name);
    expect(read?.mediaType).toBe("image/png");
    expect(read?.buf.equals(PNG)).toBe(true);
  });

  it("uses a public store only when told to", async () => {
    vi.stubEnv("BLOB_ACCESS", "public");
    const saved = await savePhoto(file(PNG));
    expect(store.get(`uploads/${saved.url.split("/").pop()}`)?.access).toBe("public");
  });

  it("returns nothing for missing photos and names that aren't ours", async () => {
    expect(await readPhoto("00000000-0000-4000-8000-000000000000.png")).toBeNull();
    expect(await readPhoto("../../etc/passwd")).toBeNull();
  });

  it("still rejects files that aren't images before uploading anything", async () => {
    await expect(savePhoto(file(Buffer.from("<script>alert(1)</script>"), "x.png"))).rejects.toThrow(/JPEG, PNG, WebP, or GIF/);
    expect(put).not.toHaveBeenCalled();
  });
});
