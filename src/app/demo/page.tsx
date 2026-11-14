import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { getClockOffsetMs } from "@/lib/clock";
import { DEPARTMENTS, DEPARTMENT_LABEL } from "@/lib/domain";
import { USERS } from "@/lib/seed/data";
import { formatDateTime } from "@/lib/format";
import { DemoControls, UserButton } from "./DemoControls";

export const metadata: Metadata = { title: "Demo controls" };

export default async function DemoPage() {
  const { viewer, now } = await getContext();
  const [users, offset] = await Promise.all([
    prisma.user.findMany({ include: { residenceBuilding: true, room: true }, orderBy: { name: "asc" } }),
    getClockOffsetMs(),
  ]);
  const titles = new Map(USERS.map((u) => [u.id, u.title]));
  const students = users.filter((u) => u.role === "STUDENT");
  const admins = users.filter((u) => u.role === "ADMIN");

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:pt-10">
      <h1 className="h-page">Demo controls</h1>
      <p className="mt-1.5 max-w-prose text-ink-2">
        There&apos;s no real login in this demo. Pick anyone to see exactly what they can see: residents only see their own hall, staff see their
        department&apos;s queue, and the administrator sees campus-wide insights.
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
          Administrator
        </h2>
        <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {admins.map((u) => (
            <li key={u.id}>
              <UserButton id={u.id} name={u.name} hue={u.avatarHue} detail={titles.get(u.id) ?? "Administrator"} current={u.id === viewer.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
