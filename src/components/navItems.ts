import type { Role } from "@/lib/domain";

export type NavItem = { href: string; label: string; icon: "home" | "map" | "plus" | "list" | "bell" | "queue" | "chart" | "qr" };

export function navItemsFor(role: Role): NavItem[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Insights", icon: "chart" },
      { href: "/staff", label: "Queues", icon: "queue" },
      { href: "/report", label: "Report", icon: "plus" },
      { href: "/map", label: "Map", icon: "map" },
      { href: "/qr", label: "QR codes", icon: "qr" },
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
  return [
    { href: "/", label: "Home", icon: "home" },
    { href: "/map", label: "Map", icon: "map" },
    { href: "/report", label: "Report", icon: "plus" },
    { href: "/tickets", label: "My reports", icon: "list" },
    { href: "/notifications", label: "Alerts", icon: "bell" },
  ];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
