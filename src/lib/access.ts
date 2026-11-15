// Which pages each role may open. Used to decide whether a "?next=" path after
// sign-in is safe to follow; every page still checks its own role.
import type { Role } from "./domain";

const ROLE_PREFIXES: Record<Role, string[]> = {
  STUDENT: ["/", "/map", "/report", "/tickets", "/my-tickets", "/notifications", "/advisories", "/account"],
  CONTRACTOR: ["/jobs", "/tickets", "/notifications", "/advisories", "/account"],
  STAFF: ["/staff", "/map", "/report", "/tickets", "/notifications", "/advisories", "/account", "/qr", "/admin/users", "/admin/contractors", "/admin"],
  ADMIN: ["/admin", "/staff", "/map", "/report", "/tickets", "/notifications", "/advisories", "/account", "/qr", "/demo"],
};

/** A same-origin path (no scheme, no "//") that this role is allowed to open. */
export function canAccessPath(role: Role, path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  const pathname = path.split(/[?#]/)[0];
  if (/^\/(login|signup|forgot-password|reset-password|invite|api)(\/|$)/.test(pathname)) return false;
  return ROLE_PREFIXES[role].some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "CONTRACTOR":
      return "/jobs";
    case "STAFF":
      return "/staff";
    case "ADMIN":
      return "/admin";
    default:
      return "/";
  }
}
