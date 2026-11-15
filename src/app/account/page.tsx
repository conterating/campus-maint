import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getActor, getViewer } from "@/lib/session";
import { residenceOptions } from "@/lib/residences";
import { DEPARTMENT_LABEL, ROLE_LABEL, STUDENT_YEAR_LABEL, isRole, type Department, type StudentYear } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { ProfileForm, ResidenceForm, SessionsPanel } from "./AccountForms";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const viewer = await getViewer();
  const actor = await getActor();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    include: { residenceBuilding: true, room: true, staffProfile: true, contractorProfile: true, _count: { select: { sessions: true } } },
  });
  const role = isRole(user.role) ? user.role : "STUDENT";
  const halls = role === "STUDENT" ? await residenceOptions() : [];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Account</h1>
      {viewer.impersonator && <p className="mt-2 text-sm font-bold text-urgent">You&apos;re viewing as someone else. This page shows your own administrator account.</p>}

      <section aria-labelledby="who" className="card mt-6 p-5 md:p-6">
        <h2 id="who" className="h-section text-lg">
          Your details
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Item label="Name">{`${user.firstName} ${user.lastName}`.trim() || user.name}</Item>
          <Item label="Username">{user.username}</Item>
          <Item label="Email">{user.email}</Item>
          <Item label="Role">
            {ROLE_LABEL[role]}
            {user.department ? ` · ${DEPARTMENT_LABEL[user.department as Department]}` : ""}
            {user.isSupervisor ? " · Supervisor" : ""}
          </Item>
          {user.gtId && <Item label="GT ID">{`•••••${user.gtId.slice(-4)}`}</Item>}
          {user.studentYear && <Item label="Year">{STUDENT_YEAR_LABEL[user.studentYear as StudentYear]}</Item>}
          {user.staffProfile && <Item label="Title">{user.staffProfile.title}</Item>}
          {user.contractorProfile && <Item label="Company">{user.contractorProfile.companyName}</Item>}
          {user.lastLoginAt && <Item label="Last sign-in">{formatDateTime(user.lastLoginAt)}</Item>}
        </dl>
        <p className="hint mt-4">To change your name, username, or role, contact an administrator.</p>
      </section>

      <section aria-labelledby="profile" className="card mt-6 p-5 md:p-6">
        <h2 id="profile" className="h-section text-lg">
          Contact and profile
        </h2>
        <ProfileForm
          isStudent={role === "STUDENT"}
          initial={{ preferredName: user.preferredName ?? "", phone: user.phone ?? "", gender: user.gender ?? "", genderSelfDescribe: user.genderSelfDescribe ?? "" }}
        />
      </section>

      {role === "STUDENT" && (
        <section aria-labelledby="residence" className="card mt-6 p-5 md:p-6">
          <h2 id="residence" className="h-section text-lg">
            Residence
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {user.residenceBuilding ? (
              <>
                {user.residenceBuilding.name}
                {user.room ? `, ${user.room.label}` : ""} ·{" "}
                <span className={`font-bold ${user.residenceVerified ? "text-resolved" : "text-urgent"}`}>{user.residenceVerified ? "Confirmed by Housing" : "Waiting for Housing to confirm"}</span>
              </>
            ) : (
              "Off campus"
            )}
          </p>
          <ResidenceForm halls={halls} current={{ residenceBuildingId: user.residenceBuildingId ?? "", roomId: user.roomId ?? "" }} />
        </section>
      )}

      <section aria-labelledby="security" className="card mt-6 p-5 md:p-6">
        <h2 id="security" className="h-section text-lg">
          Password and sign-in
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Two-factor sign-in is <span className="font-bold text-ink">{user.twoFactorEnabled ? "on" : "off"}</span>.{" "}
          <Link href="/account/security" className="font-bold text-navy underline underline-offset-2">
            Change your password or two-factor sign-in
          </Link>
        </p>
        <SessionsPanel count={user._count.sessions} />
      </section>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-bold text-ink">{children}</dd>
    </div>
  );
}
