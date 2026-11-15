import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic check only: no session cookie → /login. The real check (is the
// session valid, is the account enabled, what may this role see) happens in
// getViewer() on every page and server action.

const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password", "/invite", "/api/auth", "/map", "/tickets"];
// Guests can browse public issues: the home page, the map, and the issue list and pages.
const PUBLIC_EXACT = ["/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !getSessionCookie(request, { cookiePrefix: "rr" })) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }

  // Let server code know which page is rendering (for "back to where you were" and 2FA enrollment).
  const headers = new Headers(request.headers);
  headers.set("x-rr-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip Next internals, static files, and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
