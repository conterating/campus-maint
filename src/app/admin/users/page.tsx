import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getContext, homeFor } from "@/lib/session";
import { can } from "@/lib/visibility";
import { residenceOptions } from "@/lib/residences";
import { DEPARTMENT_LABEL, GENDER_LABEL, ROLES, ROLE_LABEL, STUDENT_YEAR_LABEL, isRole, type Department, type Gender, type StudentYear } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { redirect } from "next/navigation";
import { AdminNav } from "../AdminNav";
import { CreateStaffForm, ResidenceDecision, UserRowActions } from "./UserForms";

export const metadata: Metadata = { title: "People" };

type Search = Promise<{ q?: string; role?: string; pending?: string }>;

export default async function UsersPage({ searchParams }: { searchParams: Search }) {
  const { viewer } = await getContext();
  const manage = can(viewer, "canManageUsers");
  const verify = can(viewer, "canVerifyResidence");
  if (!manage && !verify) redirect(homeFor(viewer.role));
  const isAdmin = viewer.role === "ADMIN";

  const { q = "", role, pending } = await searchParams;
  const roleFilter = isRole(role) ? role : undefined;
  const term = q.trim().toLowerCase();
  const where: Prisma.UserWhereInput = {
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(pending ? { role: "STUDENT", residenceVerified: false, residenceBuildingId: { not: null } } : {}),
    ...(term ? { OR: [{ name: { contains: term } }, { username: { contains: term } }, { email: { contains: term } }, { firstName: { contains: term } }, { lastName: { contains: term } }] } : {}),
    // Staff who can only verify residences see students.
    ...(!manage ? { role: "STUDENT" } : {}),
  };
  const [users, awaiting, halls] = await Promise.all([
    prisma.user.findMany({ where, include: { residenceBuilding: true, room: true, staffProfile: true }, orderBy: [{ role: "asc" }, { lastName: "asc" }, { name: "asc" }], take: 200 }),
    prisma.user.findMany({ where: { role: "STUDENT", residenceVerified: false, residenceBuildingId: { not: null }, disabledAt: null }, include: { residenceBuilding: true, room: true }, orderBy: { createdAt: "asc" } }),
    residenceOptions(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">People</h1>
      <p className="mt-1 text-ink-2">Accounts, roles and permissions{verify ? ", and residence checks" : ""}.</p>
      <AdminNav viewer={viewer} current="users" />

      {verify && (
        <section aria-labelledby="pending-title" className="card mt-6 p-5">
          <h2 id="pending-title" className="h-section text-lg">
            Rooms waiting for Housing <span className="num text-ink-3">{awaiting.length}</span>
          </h2>
          {awaiting.length ? (
            <ul className="mt-3 divide-y divide-line">
              {awaiting.map((u) => (
                <li key={u.id} className="py-3">
                  <ResidenceDecision
                    user={{ id: u.id, name: u.name, username: u.username ?? "", hall: u.residenceBuilding?.name ?? "", room: u.room?.label ?? "No room", residenceBuildingId: u.residenceBuildingId ?? "", roomId: u.roomId ?? "" }}
                    halls={halls}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-3">Every student&apos;s room is confirmed.</p>
          )}
        </section>
      )}

      {manage && (
        <section aria-labelledby="create-title" className="card mt-6 p-5">
          <h2 id="create-title" className="h-section text-lg">
            Add a staff member or administrator
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            They&apos;ll get an invite email with a link to set their password (valid for 72 hours). Contractors are added on the{" "}
            <Link href="/admin/contractors" className="font-bold text-navy underline underline-offset-2">
              Contractors
            </Link>{" "}
            page.
          </p>
          <CreateStaffForm isAdmin={isAdmin} />
        </section>
      )}

      <section aria-labelledby="list-title" className="mt-8">
        <h2 id="list-title" className="h-section text-lg">
          Accounts
        </h2>
        <form className="mt-3 flex flex-wrap items-end gap-3" role="search" aria-label="Find accounts">
          <div className="min-w-56 flex-1">
            <label htmlFor="search-q" className="label">
              Search
            </label>
            <input id="search-q" name="q" defaultValue={q} className="field" placeholder="Name, username, or email" />
          </div>
          {manage && (
            <div>
              <label htmlFor="search-role" className="label">
                Role
              </label>
              <select id="search-role" name="role" defaultValue={roleFilter ?? ""} className="field">
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>

        <p className="mb-2 mt-4 text-sm text-ink-3" aria-live="polite">
          {users.length} {users.length === 1 ? "account" : "accounts"}
        </p>
        <ul className="list-group">
          {users.map((u) => {
            const r = isRole(u.role) ? u.role : "STUDENT";
            return (
              <li key={u.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">
                      {u.name} <span className="font-normal text-ink-3">@{u.username}</span>
                    </p>
                    <p className="text-sm text-ink-2">
                      <span className="pill bg-navy-50 !text-xs text-navy">{ROLE_LABEL[r]}</span>{" "}
                      {u.department && DEPARTMENT_LABEL[u.department as Department]}
                      {u.isSupervisor && " · Supervisor"}
                      {u.staffProfile && ` · ${u.staffProfile.title}`}
                      {u.disabledAt && <span className="ml-1 font-bold text-emergency">· Disabled</span>}
                      {!u.emailVerified && <span className="ml-1 text-urgent">· Email not confirmed</span>}
                    </p>
                    {r === "STUDENT" && (
                      <p className="text-sm text-ink-2">
                        {u.studentYear && `${STUDENT_YEAR_LABEL[u.studentYear as StudentYear]} · `}
                        {u.residenceBuilding ? `${u.residenceBuilding.name}${u.room ? `, ${u.room.label}` : ""}` : "Off campus"}
                        {u.residenceBuilding && (u.residenceVerified ? " · confirmed" : " · waiting for Housing")}
                      </p>
                    )}
                    {isAdmin && (u.gtId || u.gender) && (
                      <p className="text-xs text-ink-3">
                        {u.gtId && `GT ID ${u.gtId}`}
                        {u.gender && ` · ${GENDER_LABEL[u.gender as Gender]}${u.gender === "SELF_DESCRIBE" && u.genderSelfDescribe ? `: ${u.genderSelfDescribe}` : ""}`}
                      </p>
                    )}
                    <p className="text-xs text-ink-3">{u.lastLoginAt ? `Last sign-in ${formatDateTime(u.lastLoginAt)}` : "Never signed in"}</p>
                  </div>
                  {manage && u.id !== viewer.id && (r !== "ADMIN" || isAdmin) && (
                    <UserRowActions
                      isAdmin={isAdmin}
                      user={{
                        id: u.id,
                        name: u.name,
                        role: r,
                        department: u.department ?? "",
                        isSupervisor: u.isSupervisor,
                        disabled: !!u.disabledAt,
                        invitePending: !u.emailVerified && r !== "STUDENT",
                        title: u.staffProfile?.title ?? "",
                        perms: {
                          canManageUsers: u.staffProfile?.canManageUsers ?? false,
                          canManageContractors: u.staffProfile?.canManageContractors ?? false,
                          canVerifyResidence: u.staffProfile?.canVerifyResidence ?? false,
                          canViewAnalytics: u.staffProfile?.canViewAnalytics ?? false,
                          canAssignWork: u.staffProfile?.canAssignWork ?? true,
                        },
                      }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
