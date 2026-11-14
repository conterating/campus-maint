"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Bot, Building, CheckCircle2, DoorClosed, Loader2, Lock, Users } from "lucide-react";
import { analyzeReport, meTooAction, submitReport, type AnalyzeResult } from "@/app/actions";
import { routeTicket } from "@/config/routing";
import {
  BUILDING_KIND_LABEL,
  BUILDING_KINDS,
  CATEGORIES,
  CATEGORY_LABEL,
  DEPARTMENT_LABEL,
  LOCATION_TYPE_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  formatTicketNumber,
  locationTypeFor,
  type BuildingKind,
  type Category,
  type LocationType,
  type Severity,
} from "@/lib/domain";
import type { LocBuilding } from "@/lib/locations";
import { PhotoPicker } from "@/components/PhotoPicker";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { CATEGORY_ICON, SeverityGlyph, SEVERITY_STYLE, StatusPill } from "@/components/badges";

type Props = {
  locations: LocBuilding[];
  prefill: { buildingId: string; spaceId: string | null; assetId: string | null } | null;
  myRoom: { buildingId: string; spaceId: string; label: string } | null;
  myHall: { buildingId: string; label: string } | null;
  aiEnabled: boolean;
  police: { label: string; phone: string; tel: string };
  targets: Record<Severity, number>;
  viewerIsStudent: boolean;
};

const SEVERITY_HINT: Record<Severity, string> = {
  EMERGENCY: "Danger to people or property right now",
  URGENT: "Space unusable, insecure, or many people affected",
  STANDARD: "Broken, but people can work around it",
  LOW: "Cosmetic or minor",
};

function targetLabel(h: number) {
  return h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${h / 24} days`;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5 md:p-6">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden className="mb-4 flex items-center gap-3">
        <span className="num grid size-7 place-items-center rounded-full bg-navy text-[0.8125rem] font-bold text-white">{n}</span>
        <span className="h-section text-[1.0625rem]">{title}</span>
      </div>
      {children}
    </fieldset>
  );
}

export function ReportForm({ locations, prefill, myRoom, myHall, aiEnabled, police, targets, viewerIsStudent }: Props) {
  const router = useRouter();
  const ids = { building: useId(), space: useId(), asset: useId(), desc: useId(), descHint: useId(), summary: useId(), category: useId() };

  const [buildingId, setBuildingId] = useState(prefill?.buildingId ?? "");
  const [spaceId, setSpaceId] = useState(prefill?.spaceId ?? "");
  const [assetId, setAssetId] = useState(prefill?.assetId ?? "");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [category, setCategory] = useState<Category>("OTHER");
  const [severity, setSeverity] = useState<Severity>("STANDARD");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [analyzing, startAnalyze] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [meTooBusy, setMeTooBusy] = useState<string | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  const building = locations.find((b) => b.id === buildingId);
  const space = building?.spaces.find((s) => s.id === spaceId);
  const assets = (building?.assets ?? []).filter((a) => !spaceId || a.spaceId === spaceId || a.spaceId === null);
  const locType: LocationType | null = building ? locationTypeFor(building.kind, space?.scope) : null;
  const route = locType ? routeTicket(category, locType) : null;
  const hazards = analysis?.triage.hazards ?? [];
  const lockedEmergency = hazards.length > 0;

  // Any change to the inputs makes a previous analysis stale.
  const fingerprint = `${buildingId}|${spaceId}|${assetId}|${description.trim()}|${photo?.name ?? ""}|${photo?.size ?? 0}`;
  const [analyzedFingerprint, setAnalyzedFingerprint] = useState<string | null>(null);
  const isStale = analysis !== null && analyzedFingerprint !== fingerprint;

  useEffect(() => {
    if (analysis && !isStale) resultsHeading.current?.focus();
    // focus only when a fresh analysis arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  const grouped = useMemo(() => {
    const byKind = new Map<BuildingKind, LocBuilding[]>();
    for (const b of locations) {
      const k = b.kind as BuildingKind;
      byKind.set(k, [...(byKind.get(k) ?? []), b]);
    }
    return BUILDING_KINDS.filter((k) => byKind.has(k)).map((k) => ({ kind: k, buildings: byKind.get(k)! }));
  }, [locations]);

  function chooseBuilding(id: string) {
    setBuildingId(id);
    setSpaceId("");
    setAssetId("");
  }

  function analyze(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!buildingId) return setError("Choose the building first.");
    if (description.trim().length < 8) return setError("Describe the problem in a few more words so we can route it.");
    const fd = new FormData();
    fd.set("buildingId", buildingId);
    if (spaceId) fd.set("spaceId", spaceId);
    if (assetId) fd.set("assetId", assetId);
    fd.set("description", description);
    if (photo) fd.set("photo", photo);
    const fp = fingerprint;
    startAnalyze(async () => {
      const res = await analyzeReport(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const t = res.data.triage;
      setAnalysis(res.data);
      setAnalyzedFingerprint(fp);
      setCategory(t.category);
      setSeverity(t.severity);
      setSummary(t.summary);
      const dupText = res.data.duplicates.length
        ? ` ${res.data.duplicates.length} similar open issue${res.data.duplicates.length === 1 ? "" : "s"} found nearby.`
        : "";
      setAnnounce(
        `Classified as ${CATEGORY_LABEL[t.category]}, ${SEVERITY_LABEL[t.severity]}, routed to ${DEPARTMENT_LABEL[t.department]}.${dupText}${
          t.hazards.length ? " Emergency: call campus police if anyone is in danger." : ""
        }`,
      );
    });
  }

  function submit() {
    if (!analysis) return;
    setError(null);
    startSubmit(async () => {
      const res = await submitReport({
        buildingId,
        spaceId: spaceId || null,
        assetId: assetId || null,
        description,
        photoUrl: analysis.photoUrl,
        category,
        severity,
        summary,
        token: analysis.token,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/tickets/${res.data.id}?created=1`);
    });
  }

  async function meToo(id: string) {
    setMeTooBusy(id);
    const res = await meTooAction(id);
    setMeTooBusy(null);
    if (!res.ok) return setError(res.error);
    router.push(`/tickets/${id}?metoo=1`);
  }

  const showEmergency = analysis && !isStale && (lockedEmergency || severity === "EMERGENCY");
  const CatIcon = CATEGORY_ICON[category];

  return (
    <div className="mt-6 space-y-5">
      <p aria-live="polite" className="sr-only">
        {analyzing ? "Checking your report…" : announce}
      </p>

      <form onSubmit={analyze} noValidate className="space-y-5">
        <Step n={1} title="Where is it?">
          {viewerIsStudent && (myRoom || myHall) && (
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Quick locations">
              {myRoom && (
                <button
                  type="button"
                  onClick={() => {
                    setBuildingId(myRoom.buildingId);
                    setSpaceId(myRoom.spaceId);
                    setAssetId("");
                  }}
                  aria-pressed={buildingId === myRoom.buildingId && spaceId === myRoom.spaceId}
                  className="btn btn-secondary btn-sm"
                >
                  <DoorClosed aria-hidden className="size-4" /> My room
                </button>
              )}
              {myHall && (
                <button
                  type="button"
                  onClick={() => chooseBuilding(myHall.buildingId)}
                  aria-pressed={buildingId === myHall.buildingId && spaceId !== myRoom?.spaceId}
                  className="btn btn-secondary btn-sm"
                >
                  <Building aria-hidden className="size-4" /> {myHall.label} shared areas
                </button>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor={ids.building} className="label">
                Building
              </label>
              <select id={ids.building} className="field" value={buildingId} onChange={(e) => chooseBuilding(e.target.value)} required>
                <option value="">Choose a building…</option>
                {grouped.map((g) => (
                  <optgroup key={g.kind} label={BUILDING_KIND_LABEL[g.kind]}>
                    {g.buildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.space} className="label">
                Room or area <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <select
                id={ids.space}
                className="field"
                value={spaceId}
                onChange={(e) => {
                  setSpaceId(e.target.value);
                  setAssetId("");
                }}
                disabled={!building}
              >
                <option value="">{building ? "Whole building / not sure" : "Choose a building first"}</option>
                {building?.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.scope === "DORM_ROOM" ? " (your room)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.asset} className="label">
                Equipment <span className="font-normal text-ink-3">(optional)</span>
              </label>
              <select id={ids.asset} className="field" value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={!building || assets.length === 0}>
                <option value="">{assets.length ? "None / not sure" : "No tagged equipment here"}</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {locType && (
            <p className="mt-4 flex items-start gap-2 text-sm text-ink-3">
              <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {locType === "DORM_ROOM"
                ? "Inside your room: only you, your roommates, and staff can see this report. You'll own the ticket."
                : locType === "DORM_SHARED"
                  ? "Shared area of your hall: only its residents and staff can see this report."
                  : `${LOCATION_TYPE_LABEL[locType]}: everyone can see this report and add a “me too”.`}
            </p>
          )}
        </Step>

        <Step n={2} title="What's wrong?">
          <div>
            <label htmlFor={ids.desc} className="label">
              Describe the problem
            </label>
            <textarea
              id={ids.desc}
              className="field min-h-28 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              aria-describedby={ids.descHint}
              placeholder="e.g. Water is leaking from under the bathroom sink and pooling on the floor."
              required
            />
            <p id={ids.descHint} className="hint mt-1.5 flex justify-between gap-4">
              <span>What you see, where exactly, and since when.</span>
              <span aria-hidden className="num">
                {description.length}/2000
              </span>
            </p>
          </div>
          <div className="mt-4">
            <PhotoPicker value={photo} onChange={setPhoto} disabled={analyzing || submitting} />
          </div>
        </Step>

        {error && (
          <p role="alert" className="rounded-[12px] bg-emergency-bg px-4 py-3 text-sm font-bold text-emergency ring-1 ring-inset ring-emergency/25">
            {error}
          </p>
        )}

        {(!analysis || isStale) && (
          <div>
            {isStale && <p className="mb-2 text-sm font-bold text-urgent">You changed the details. Check the report again before submitting.</p>}
            <button type="submit" className="btn btn-primary w-full !min-h-12 text-base" disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2 aria-hidden className="size-5 animate-spin" /> Reading your report…
                </>
              ) : (
                <>
                  Check and route it <ArrowRight aria-hidden className="size-5" />
                </>
              )}
            </button>
            <p className="hint mt-2 text-center">
              {aiEnabled ? "Claude classifies your report in a few seconds." : "Classified instantly by FixIt's routing rules."} Nothing is filed until you confirm.
            </p>
          </div>
        )}
      </form>

      {/* ---- Review ---- */}
      {analysis && !isStale && (
        <section aria-labelledby="review-title" className="rise space-y-5">
          {showEmergency && <EmergencyBanner police={police} hazards={hazards} />}

          {analysis.duplicates.length > 0 && (
            <section aria-labelledby="dup-title" className="card overflow-hidden">
              <div className="border-b border-line bg-buzz-50 px-5 py-4">
                <h2 id="dup-title" className="flex items-center gap-2 font-display text-[1.0625rem] font-bold text-ink">
                  <Users aria-hidden className="size-5 text-gold-ink" /> Already reported?
                </h2>
                <p className="mt-0.5 text-sm text-ink-2">These open issues look like yours. A “me too” raises their priority and keeps you updated, without a duplicate.</p>
              </div>
              <ul className="divide-y divide-line">
                {analysis.duplicates.map((d) => (
                  <li key={d.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold leading-snug text-ink">{d.summary}</p>
                        <p className="mt-0.5 text-sm text-ink-3">
                          <span className="num">{formatTicketNumber(d.number)}</span> · {d.locationLabel}
                        </p>
                      </div>
                      <StatusPill status={d.status} size="sm" />
                    </div>
                    <p className="mt-2 text-[0.8125rem] text-ink-3">
                      {d.reasons.join(" · ")} · <span className="font-bold text-ink-2">{d.meTooCount} me too</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {d.reportedByViewer ? (
                        <p className="text-sm font-bold text-navy">You reported this one.</p>
                      ) : d.viewerMeToo ? (
                        <p className="flex items-center gap-1.5 text-sm font-bold text-resolved">
                          <CheckCircle2 aria-hidden className="size-4" /> You already said me too.
                        </p>
                      ) : viewerIsStudent ? (
                        <button type="button" className="btn btn-accent btn-sm" onClick={() => meToo(d.id)} disabled={meTooBusy !== null}>
                          {meTooBusy === d.id ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Users aria-hidden className="size-4" />}
                          Me too — this is my problem
                        </button>
                      ) : null}
                      <Link href={`/tickets/${d.id}`} className="btn btn-ghost btn-sm">
                        View issue<span className="sr-only"> {formatTicketNumber(d.number)}</span>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* The routing slip: the work-order tag, the one signature element on this screen. */}
          <div className="tag-wrap">
            <div className="tag py-5 pr-5 md:py-6 md:pr-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="review-title" ref={resultsHeading} tabIndex={-1} className="font-display text-[1.25rem] font-bold tracking-[-0.015em] text-ink outline-none">
                  Here&apos;s how we&apos;ll route it
                </h2>
                <span className="pill bg-surface-2 text-ink-3 ring-1 ring-inset ring-line">
                  <Bot aria-hidden className="size-3.5" />
                  {analysis.triage.source === "claude" ? "Classified by Claude" : "Classified by routing rules"}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-3">Check it over and change anything that looks wrong.</p>
              {analysis.triage.fallbackReason && <p className="mt-2 text-sm text-urgent">The AI classifier didn&apos;t respond, so we used the routing rules instead.</p>}

              <div className="mt-5 flex items-center gap-4 rounded-[12px] bg-navy px-4 py-4 text-white">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-white/10 text-buzz">
                  <CatIcon className="size-5" />
                </span>
                <dl className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-[0.06em] text-white/65">Goes to</dt>
                  <dd className="font-display text-[1.375rem] font-bold leading-tight">{route ? DEPARTMENT_LABEL[route.department] : "—"}</dd>
                  <dd className="mt-0.5 text-sm text-white/80">
                    {CATEGORY_LABEL[category]} · first response within <span className="num font-bold text-buzz">{targetLabel(targets[severity])}</span>
                  </dd>
                </dl>
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label htmlFor={ids.summary} className="label">
                    One-line summary
                  </label>
                  <input id={ids.summary} className="field" value={summary} maxLength={120} onChange={(e) => setSummary(e.target.value)} />
                </div>

                <div>
                  <label htmlFor={ids.category} className="label">
                    Category
                  </label>
                  <select id={ids.category} className="field" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  {category !== analysis.triage.category && <p className="hint mt-1.5">Changed from {CATEGORY_LABEL[analysis.triage.category]}. Routing updated to match.</p>}
                </div>

                <fieldset>
                  <legend className="label">How serious is it?</legend>
                  {lockedEmergency && (
                    <p className="mb-2 flex items-center gap-2 text-sm text-emergency">
                      <Lock aria-hidden className="size-4" /> Safety reports stay at Emergency. Staff can adjust it after checking.
                    </p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SEVERITIES.map((s) => {
                      const checked = severity === s;
                      const disabled = lockedEmergency && s !== "EMERGENCY";
                      return (
                        <label
                          key={s}
                          className={`flex cursor-pointer gap-3 rounded-[12px] p-3.5 ring-inset transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy ${
                            checked ? "bg-navy-50 ring-2 ring-navy" : "bg-surface ring-1 ring-line-2 hover:bg-surface-2"
                          } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                        >
                          <input type="radio" name="severity" value={s} checked={checked} disabled={disabled} onChange={() => setSeverity(s)} className="mt-1 size-4 accent-[var(--navy)]" />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 font-bold text-ink">
                              <span className={SEVERITY_STYLE[s].fg}>
                                <SeverityGlyph severity={s} />
                              </span>
                              {SEVERITY_LABEL[s]}
                              {s === analysis.triage.severity && <span className="text-xs font-normal text-ink-3">· suggested</span>}
                            </span>
                            <span className="mt-0.5 block text-sm text-ink-2">{SEVERITY_HINT[s]}</span>
                            <span className="mt-0.5 block text-xs text-ink-3">Response within {targetLabel(targets[s])}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              {analysis.triage.rationale && (
                <p className="mt-5 rounded-[10px] bg-surface-2 px-3 py-2.5 text-sm text-ink-2 ring-1 ring-inset ring-line">
                  <span className="font-bold text-ink">Why: </span>
                  {analysis.triage.rationale}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            className={`btn w-full !min-h-12 text-base ${severity === "EMERGENCY" ? "btn-danger" : "btn-primary"}`}
            disabled={submitting || summary.trim().length < 3}
          >
            {submitting ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <CheckCircle2 aria-hidden className="size-5" />}
            {submitting ? "Submitting…" : analysis.duplicates.length ? "Submit as a new issue" : "Submit report"}
          </button>
        </section>
      )}
    </div>
  );
}
