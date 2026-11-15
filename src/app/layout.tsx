import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Gabarito, Big_Shoulders } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { PublicHeader } from "@/components/PublicHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottomNav } from "@/components/NavLinks";
import { ImpersonationBanner, ResidenceBanner } from "@/components/SessionBanners";
import { demoModeEnabled, getSessionState } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getClockOffsetMs } from "@/lib/clock";
import { ROLE_LABEL } from "@/lib/domain";

// Bricolage Grotesque: display headings. Gabarito: reading and UI. Big Shoulders: stamped ticket numbers, IDs, times, counts.
const signage = Big_Shoulders({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-signage", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--font-bricolage", display: "swap" });
const gabarito = Gabarito({ subsets: ["latin"], variable: "--font-gabarito", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Ramblin’ Repairs", template: "%s · Ramblin’ Repairs" },
  description: "Report, track, and see campus maintenance issues at Georgia Tech.",
  applicationName: "Ramblin’ Repairs",
};

export const viewport: Viewport = {
  themeColor: "#003057",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const state = await getSessionState();
  const signedIn = state.status === "ok" ? state : null;
  const viewer = signedIn?.viewer ?? null;
  const [unread, offsetMs, shown] = viewer
    ? await Promise.all([
        prisma.notification.count({ where: { userId: viewer.id, read: false } }),
        getClockOffsetMs(),
        prisma.user.findUnique({ where: { id: viewer.id }, select: { firstName: true, preferredName: true, lastName: true, name: true } }),
      ])
    : [0, 0, null];
  const displayName = shown ? (shown.firstName || shown.preferredName ? `${shown.preferredName || shown.firstName} ${shown.lastName}`.trim() : shown.name) : "";

  return (
    <html lang="en" className={`${signage.variable} ${bricolage.variable} ${gabarito.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {viewer && signedIn ? (
          <>
            {viewer.impersonator && <ImpersonationBanner name={viewer.name} role={ROLE_LABEL[viewer.role]} />}
            <AppHeader viewer={viewer} displayName={displayName} unread={unread} clockOffsetMs={offsetMs} demoMode={demoModeEnabled()} realRole={signedIn.user.role} />
            {viewer.role === "STUDENT" && viewer.residenceVerified === false && signedIn.user.residenceBuildingId && <ResidenceBanner />}
          </>
        ) : (
          <PublicHeader />
        )}
        <main id="main" tabIndex={-1} className="flex-1 w-full pb-12 outline-none">
          {children}
        </main>
        <SiteFooter signedIn={!!viewer} />
        <BottomNav role={viewer?.role ?? "GUEST"} unread={unread} />
      </body>
    </html>
  );
}
