import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getContext, requirePageRole } from "@/lib/session";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABEL, isAuditAction, type AuditAction } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { AdminNav } from "../AdminNav";

export const metadata: Metadata = { title: "Audit log" };

type Search = Promise<{ actor?: string; action?: string; target?: string }>;

function describe(json: string | null): string | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${v === null ? "none" : String(v)}`)
      .join(", ");
  } catch {
    return null;
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const { viewer } = await getContext();
  requirePageRole(viewer, "ADMIN");
  const { actor = "", action = "", target = "" } = await searchParams;

  const where: Prisma.AuditLogWhereInput = {
    ...(actor ? { actorId: actor } : {}),
    ...(isAuditAction(action) ? { action } : {}),
    ...(target.trim() ? { OR: [{ targetId: target.trim() }, { targetType: target.trim() }] } : {}),
  };
  const [rows, actors] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true, username: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.user.findMany({ where: { auditEntries: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const targetIds = [...new Set(rows.filter((r) => r.targetType === "User").map((r) => r.targetId))];
  const targets = new Map((await prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Audit log</h1>
      <p className="mt-1 text-ink-2">Every account, permission, residence, and impersonation change.</p>
      <AdminNav viewer={viewer} current="audit" />

      <form className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter the audit log">
        <div>
          <label htmlFor="actor" className="label">
            Who
          </label>
          <select id="actor" name="actor" defaultValue={actor} className="field">
            <option value="">Anyone</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="action" className="label">
            Action
          </label>
          <select id="action" name="action" defaultValue={action} className="field">
            <option value="">Any action</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="target" className="label">
            Target ID
          </label>
          <input id="target" name="target" defaultValue={target} className="field" placeholder="e.g. u-terrence" />
        </div>
        <button type="submit" className="btn btn-secondary">
          Filter
        </button>
      </form>

      <p className="mb-2 mt-5 text-sm text-ink-3" aria-live="polite">
        {rows.length} {rows.length === 1 ? "entry" : "entries"}
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Audit log entries, newest first</caption>
          <thead className="border-b border-line text-xs text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-bold">When</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Who</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Action</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Target</th>
              <th scope="col" className="px-4 py-2.5 font-bold">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-2.5 font-bold text-ink">{r.actor.name}</td>
                <td className="px-4 py-2.5">{AUDIT_ACTION_LABEL[r.action as AuditAction] ?? r.action}</td>
                <td className="px-4 py-2.5 text-ink-2">
                  {targets.get(r.targetId) ?? r.targetType} <span className="text-ink-3">({r.targetId})</span>
                </td>
                <td className="px-4 py-2.5 text-ink-2">
                  {describe(r.before) && <span className="block">Before: {describe(r.before)}</span>}
                  {describe(r.after) && <span className="block">After: {describe(r.after)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
