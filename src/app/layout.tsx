import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader, LogoMark } from "@/components/AppHeader";
import { BottomNav } from "@/components/NavLinks";
import { ImpersonationBanner, ResidenceBanner } from "@/components/SessionBanners";
import { demoModeEnabled, getSessionState } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getClockOffsetMs } from "@/lib/clock";
import { ROLE_LABEL } from "@/lib/domain";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap", adjustFontFallback: false });
const atkinsonMono = Atkinson_Hyperlegible_Mono({ subsets: ["latin"], variable: "--font-atkinson-mono", display: "swap", adjustFontFallback: false });

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
    <html lang="en" className={`${atkinson.variable} ${atkinsonMono.variable}`}>
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
          <header className="no-print border-b border-line bg-surface">
            <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
              <span className="flex items-center gap-2.5">
                <LogoMark />
                <span className="text-[1.125rem] font-extrabold tracking-[-0.03em] text-navy">
                  Ramblin’<span className="ml-1 text-gold-ink">Repairs</span>
                </span>
              </span>
            </div>
          </header>
        )}
        <main id="main" tabIndex={-1} className={`flex-1 w-full outline-none ${viewer ? "pb-28 md:pb-12" : "pb-12"}`}>
          {children}
        </main>
        {viewer && <BottomNav role={viewer.role} unread={unread} />}
      </body>
    </html>
  );
}
