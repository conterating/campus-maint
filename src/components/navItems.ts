import type { Role } from "@/lib/domain";

export type NavItem = {
  href: string;
  label: string;
  icon: "home" | "map" | "plus" | "list" | "bell" | "queue" | "chart" | "qr" | "wrench" | "user" | "login";
};

/** Signed-out visitors: public browsing, with sign-in as its own tab. */
export type NavRole = Role | "GUEST";

export function navItemsFor(role: NavRole): NavItem[] {
  if (role === "GUEST") {
    return [
      { href: "/", label: "Home", icon: "home" },
      { href: "/map", label: "Map", icon: "map" },
      { href: "/tickets", label: "Issues", icon: "list" },
      { href: "/login", label: "Sign in", icon: "login" },
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Insights", icon: "chart" },
      { href: "/staff", label: "Queues", icon: "queue" },
      { href: "/report", label: "Report", icon: "plus" },
      { href: "/map", label: "Map", icon: "map" },
      { href: "/admin/users", label: "People", icon: "user" },
    ];
  }
  if (role === "STAFF") {
    return [
      { href: "/staff", label: "Queue", icon: "queue" },
      { href: "/map", label: "Map", icon: "map" },
      { href: "/report", label: "Report", icon: "plus" },
      { href: "/tickets", label: "Issues", icon: "list" },
      { href: "/qr", label: "QR codes", icon: "qr" },
    ];
  }
  if (role === "CONTRACTOR") {
    return [
      { href: "/jobs", label: "My jobs", icon: "wrench" },
      { href: "/notifications", label: "Alerts", icon: "bell" },
      { href: "/account", label: "Account", icon: "user" },
    ];
  }
  return [
    { href: "/", label: "Home", icon: "home" },
    { href: "/map", label: "Map", icon: "map" },
    { href: "/report", label: "Report", icon: "plus" },
    { href: "/my-tickets", label: "My tickets", icon: "list" },
    { href: "/notifications", label: "Alerts", icon: "bell" },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
