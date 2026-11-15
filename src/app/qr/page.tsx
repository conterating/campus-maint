import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { isStaff } from "@/lib/visibility";
import { publicBaseUrl, qrSvg, reportPath } from "@/lib/qr";
import { BUILDING_KIND_LABEL, type BuildingKind } from "@/lib/domain";
import { LogoMark } from "@/components/AppHeader";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "QR codes" };

type Search = Promise<{ building?: string }>;

type Label = { key: string; title: string; subtitle: string; code: string; svg: string; url: string };

export default async function QrPage({ searchParams }: { searchParams: Search }) {
  const { viewer } = await getContext();
  if (!isStaff(viewer)) {
    return (
      <div className="mx-auto max-w-md px-4 pt-20 text-center">
        <h1 className="h-page">QR codes are for staff</h1>
        <p className="mt-2 text-ink-2">
          Staff print these and post them on rooms and equipment. Spotted one? Scan it with your camera and the report form opens with the location filled in.
        </p>
        <Link href="/report" className="btn btn-primary mt-6">
          Report a problem
        </Link>
      </div>
    );
  }

  const { building: selected } = await searchParams;
  const buildings = await prisma.building.findMany({
    orderBy: { name: "asc" },
    include: { spaces: { orderBy: [{ floor: "asc" }, { label: "asc" }] }, assets: { orderBy: { name: "asc" } } },
  });
  const current = buildings.find((b) => b.id === selected) ?? buildings[0];
  const base = await publicBaseUrl();

  const make = async (title: string, subtitle: string, code: string, path: string, key: string): Promise<Label> => {
    const url = base + path;
    return { key, title, subtitle, code, url, svg: await qrSvg(url) };
  };

  const labels: Label[] = [
    await make(current.name, "Anywhere in this building", current.code, reportPath({ building: current.id }), current.id),
    ...(await Promise.all(current.spaces.map((s) => make(s.label, current.name, s.id.replace(/^s-/, "").toUpperCase(), reportPath({ building: current.id, space: s.id }), s.id)))),
    ...(await Promise.all(
      current.assets.map((a) => {
        const space = current.spaces.find((s) => s.id === a.spaceId);
        return make(a.name, [current.name, space?.label].filter(Boolean).join(" · "), a.tag, reportPath({ building: current.id, space: a.spaceId, asset: a.id }), a.id);
      }),
    )),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <div className="no-print">
        <h1 className="h-page">QR codes</h1>
        <p className="mt-1.5 max-w-prose text-ink-2">
          Post these on doors, rooms, and equipment. Scanning one opens the report form with the building, room, and equipment already filled in.
        </p>
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <form className="min-w-64 flex-1" action="/qr">
            <label htmlFor="qr-building" className="label">
              Building
            </label>
            <div className="flex gap-2">
              <select id="qr-building" name="building" defaultValue={current.id} className="field">
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({BUILDING_KIND_LABEL[b.kind as BuildingKind]})
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                Show
              </button>
            </div>
          </form>
          <PrintButton count={labels.length} />
        </div>
      </div>

      <h2 className="mt-8 h-section text-lg print:mt-0">
        {current.name} <span className="font-sans text-base font-normal text-ink-3">· {labels.length} labels</span>
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-3">
        {labels.map((l) => (
          <li key={l.key} className="card break-inside-avoid overflow-hidden print:shadow-none">
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-sm font-extrabold tracking-[-0.02em] text-navy">
              <LogoMark className="size-5" /> Ramblin’ Repairs
            </div>
            <div className="p-3.5">
              <div
                role="img"
                aria-label={`QR code for reporting a problem at ${l.title}, ${l.subtitle}`}
                className="mx-auto aspect-square w-full max-w-40 [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: l.svg }}
              />
              <p className="mt-2 text-center text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-ink-3">Scan to report a problem</p>
              <p className="mt-2 font-bold leading-tight text-ink">{l.title}</p>
              <p className="mt-0.5 text-xs text-ink-3">{l.subtitle}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="num text-[0.6875rem] text-ink-3">{l.code}</span>
                <Link href={l.url.replace(base, "")} className="no-print text-xs font-bold text-navy hover:underline">
                  Test this code<span className="sr-only"> for {l.title}</span>
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
