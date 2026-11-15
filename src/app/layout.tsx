import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono, Big_Shoulders } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/NavLinks";
import { getContext } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getClockOffsetMs } from "@/lib/clock";

const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap", adjustFontFallback: false });
const signage = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-signage", display: "swap" });
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
  const { viewer } = await getContext();
  const [unread, offsetMs] = await Promise.all([
    prisma.notification.count({ where: { userId: viewer.id, read: false } }),
    getClockOffsetMs(),
  ]);

  return (
    <html lang="en" className={`${atkinson.variable} ${atkinsonMono.variable} ${signage.variable}`}>
      <body className="min-h-dvh flex flex-col antialiased">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <AppHeader viewer={viewer} unread={unread} clockOffsetMs={offsetMs} />
        <main id="main" tabIndex={-1} className="flex-1 w-full pb-28 md:pb-12 outline-none">
          {children}
        </main>
        <BottomNav role={viewer.role} unread={unread} />
      </body>
    </html>
  );
}
