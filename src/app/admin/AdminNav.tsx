import Link from "next/link";
import { can, type Viewer } from "@/lib/visibility";

/** Tabs across the admin area, filtered to what this viewer may open. */
export function AdminNav({ viewer, current }: { viewer: Viewer; current: "insights" | "users" | "contractors" | "audit" }) {
  const items = [
    { key: "insights", href: "/admin", label: "Insights", show: can(viewer, "canViewAnalytics") },
    { key: "users", href: "/admin/users", label: "People", show: can(viewer, "canManageUsers") || can(viewer, "canVerifyResidence") },
    { key: "contractors", href: "/admin/contractors", label: "Contractors", show: can(viewer, "canManageContractors") },
    { key: "audit", href: "/admin/audit", label: "Audit log", show: viewer.role === "ADMIN" },
  ].filter((i) => i.show);
  if (items.length < 2) return null;
  return (
    <nav aria-label="Administration" className="mt-4 overflow-x-auto">
      <div className="seg">
        {items.map((i) => (
          <Link key={i.key} href={i.href} aria-current={current === i.key ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
