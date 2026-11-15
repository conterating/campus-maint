import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getContext, homeFor } from "@/lib/session";
import { can } from "@/lib/visibility";
import {
  AVAILABILITY_LABEL,
  BACKGROUND_CHECK_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  DEPARTMENTS,
  DEPARTMENT_LABEL,
  OPEN_STATUSES,
  SKILLS,
  SKILL_LABEL,
  parseKeyList,
  parseWorkDays,
  type Availability,
  type BackgroundCheckStatus,
} from "@/lib/domain";
import { credentialWarnings, signInBlockReason } from "@/lib/eligibility";
import Link from "next/link";
import { AdminNav } from "../AdminNav";
import { ContractorEditor, CreateContractorForm, type ContractorFormValues } from "./ContractorForms";

export const metadata: Metadata = { title: "Contractors" };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function ContractorsPage() {
  const { viewer, now } = await getContext();
  if (!can(viewer, "canManageContractors")) redirect(homeFor(viewer.role));
  const isAdmin = viewer.role === "ADMIN";

  const contractors = await prisma.user.findMany({ where: { role: "CONTRACTOR" }, include: { contractorProfile: true }, orderBy: { name: "asc" } });
  const jobs = await prisma.ticket.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: contractors.map((c) => c.id) }, status: { in: OPEN_STATUSES } }, _count: { _all: true } });
  const jobCount = new Map(jobs.map((j) => [j.assigneeId, j._count._all]));
  const rows = contractors.filter((c) => c.contractorProfile).map((c) => ({ user: c, p: c.contractorProfile!, warnings: credentialWarnings(c.contractorProfile!, now) }));
  const expiring = rows.filter((r) => r.warnings.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Contractors</h1>
      <p className="mt-1 text-ink-2">The people who do the work: trades, departments, credentials, and hall access.</p>
      <AdminNav viewer={viewer} current="contractors" />

      {expiring.length > 0 && (
        <section aria-labelledby="expiring-title" className="mt-6 rounded-[12px] bg-urgent-bg p-5 ring-1 ring-inset ring-urgent/30">
          <h2 id="expiring-title" className="flex items-center gap-2 font-bold text-ink">
            <AlertTriangle aria-hidden className="size-5 text-urgent" /> Credentials expiring or expired
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {expiring.map((r) => (
              <li key={r.user.id}>
                <span className="font-bold text-ink">{r.user.name}</span> ({r.p.companyName}): {r.warnings.join("; ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="create-title" className="card mt-6 p-5">
        <h2 id="create-title" className="h-section text-lg">
          Add a contractor
        </h2>
        <p className="mt-1 text-sm text-ink-2">They&apos;ll get an invite email to set a password. Contractors can&apos;t sign in until their background check is cleared.</p>
        <CreateContractorForm isAdmin={isAdmin} />
      </section>

      <section aria-labelledby="list-title" className="mt-8">
        <h2 id="list-title" className="h-section text-lg">
          All contractors <span className="num text-ink-3">{rows.length}</span>
        </h2>
        <ul className="list-group mt-3">
          {rows.map(({ user, p, warnings }) => {
            const blocked = signInBlockReason({ ...user, contractorProfile: p }, now);
            const values: ContractorFormValues = {
              companyName: p.companyName,
              companyPhone: p.companyPhone ?? "",
              trades: parseKeyList(p.trades, CATEGORIES),
              departments: parseKeyList(p.departments, DEPARTMENTS),
              licenseNumber: p.licenseNumber ?? "",
              licenseExpiresAt: day(p.licenseExpiresAt),
              insuranceExpiresAt: day(p.insuranceExpiresAt),
              backgroundCheckStatus: p.backgroundCheckStatus as BackgroundCheckStatus,
              backgroundCheckedAt: day(p.backgroundCheckedAt),
              residenceHallAccess: p.residenceHallAccess,
              maxActiveJobs: String(p.maxActiveJobs),
              hourlyRate: isAdmin && p.hourlyRate != null ? String(p.hourlyRate) : "",
              contractStartsAt: day(p.contractStartsAt),
              contractEndsAt: day(p.contractEndsAt),
              skills: parseKeyList(p.skills, SKILLS),
              shiftStart: hhmm(p.shiftStartMinute),
              shiftEnd: hhmm(p.shiftEndMinute),
              workDays: parseWorkDays(p.workDays),
              onCall: p.onCall,
            };
            return (
              <li key={user.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      <Link href={`/admin/contractors/${user.id}`} className="text-navy underline underline-offset-2 hover:decoration-2">
                        {user.name}
                      </Link>{" "}
                      <span className="font-normal text-ink-3">@{user.username} · {p.contractorId}</span>
                    </p>
                    <p className="text-sm text-ink-2">
                      {p.companyName} · {parseKeyList(p.departments, DEPARTMENTS).map((d) => DEPARTMENT_LABEL[d]).join(", ")}
                    </p>
                    <p className="text-sm text-ink-2">{parseKeyList(p.trades, CATEGORIES).map((c) => CATEGORY_LABEL[c]).join(", ")}</p>
                    {values.skills.length > 0 && <p className="text-sm text-ink-3">Skills: {values.skills.map((k) => SKILL_LABEL[k]).join(", ")}</p>}
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <span className="pill bg-navy-50 text-navy">{AVAILABILITY_LABEL[p.availability as Availability]}</span>
                      <span className="pill bg-bg text-ink-2">{jobCount.get(user.id) ?? 0} open jobs (max {p.maxActiveJobs})</span>
                      <span className={`pill ${p.backgroundCheckStatus === "CLEARED" ? "bg-[#ecfdf3] text-resolved" : "bg-urgent-bg text-urgent"}`}>
                        Background: {BACKGROUND_CHECK_LABEL[p.backgroundCheckStatus as BackgroundCheckStatus]}
                      </span>
                      {p.residenceHallAccess && <span className="pill bg-bg text-ink-2">Residence hall access</span>}
                      {isAdmin && p.hourlyRate != null && <span className="pill bg-bg text-ink-2">${p.hourlyRate.toFixed(2)}/hr</span>}
                      {blocked && <span className="pill bg-emergency-bg text-emergency">Can&apos;t sign in: {blocked}</span>}
                      {p.onCall && <span className="pill bg-bg text-ink-2">On call</span>}
                      <Link href={`/admin/contractors/${user.id}`} className="pill bg-navy-50 text-navy hover:underline">
                        Schedule
                      </Link>
                      {user.disabledAt && <span className="pill bg-emergency-bg text-emergency">Disabled</span>}
                    </p>
                    {warnings.length > 0 && <p className="mt-1 text-sm font-bold text-urgent">{warnings.join("; ")}</p>}
                  </div>
                  <ContractorEditor userId={user.id} name={user.name} values={values} isAdmin={isAdmin} active={!blocked && !user.disabledAt} invitePending={!user.emailVerified} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
