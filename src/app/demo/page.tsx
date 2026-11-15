import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { demoModeEnabled, getActor, getContext } from "@/lib/session";
import { getClockOffsetMs } from "@/lib/clock";
import { DEPARTMENTS, DEPARTMENT_LABEL } from "@/lib/domain";
import { USERS } from "@/lib/seed/data";
import { formatDateTime } from "@/lib/format";
import { DemoControls, UserButton } from "./DemoControls";

export const metadata: Metadata = { title: "Demo controls" };

// "Reset demo data" replays the whole seed (about 3,300 SQL statements).
// Locally that's under a second; against a hosted database every statement is
// a network round trip, so give this page's server actions the most time
// Vercel allows instead of the default.
export const maxDuration = 300;

export default async function DemoPage() {
  const { viewer, now } = await getContext();
  // Demo controls exist only in demo mode, and only for a signed-in administrator.
  const actor = await getActor();
  if (!demoModeEnabled() || actor.role !== "ADMIN") notFound();
  const [users, offset] = await Promise.all([
    prisma.user.findMany({ include: { residenceBuilding: true, room: true }, orderBy: { name: "asc" } }),
    getClockOffsetMs(),
  ]);
  const titles = new Map(USERS.map((u) => [u.id, u.title]));
  const students = users.filter((u) => u.role === "STUDENT");
  const contractors = users.filter((u) => u.role === "CONTRACTOR");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Demo controls</h1>
      <p className="mt-1.5 max-w-prose text-ink-2">
        Signed in as {actor.name}. Pick anyone to view the app as them: residents only see their own hall, contractors only see jobs assigned to them, and staff
        see their department&apos;s queue. Every switch is recorded in the audit log.
      </p>

      <DemoControls offsetMs={offset} nowLabel={formatDateTime(now)} />

      <section aria-labelledby="students-title" className="mt-10">
        <h2 id="students-title" className="h-section text-lg">
          Students
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((u) => (
            <li key={u.id}>
              <UserButton
                id={u.id}
                name={u.name}
                hue={u.avatarHue}
                detail={u.residenceBuilding ? `${u.residenceBuilding.name} · ${u.room?.label ?? ""}` : "Lives off campus"}
                current={u.id === viewer.id}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contractors-title" className="mt-10">
        <h2 id="contractors-title" className="h-section text-lg">
          Contractors
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {contractors.map((u) => (
            <li key={u.id}>
              <UserButton id={u.id} name={u.name} hue={u.avatarHue} detail={titles.get(u.id) ?? "Contractor"} current={u.id === viewer.id} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="staff-title" className="mt-10">
        <h2 id="staff-title" className="h-section text-lg">
          Staff
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((d) => (
            <div key={d}>
              <h3 className="eyebrow mb-2">{DEPARTMENT_LABEL[d]}</h3>
              <ul className="grid grid-cols-1 gap-2">
                {users
                  .filter((u) => u.role === "STAFF" && u.department === d)
                  .sort((a, b) => Number(a.isSupervisor) - Number(b.isSupervisor))
                  .map((u) => (
                    <li key={u.id}>
                      <UserButton id={u.id} name={u.name} hue={u.avatarHue} detail={titles.get(u.id) ?? (u.isSupervisor ? "Supervisor" : "Staff")} current={u.id === viewer.id} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="admin-title" className="mt-10">
        <h2 id="admin-title" className="h-section text-lg">
          Yourself
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <UserButton id={actor.id} name={actor.name} hue={actor.avatarHue} detail={titles.get(actor.id) ?? "Administrator"} current={!viewer.impersonator} />
          </li>
        </ul>
      </section>
    </div>
  );
}
