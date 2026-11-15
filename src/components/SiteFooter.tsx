import Link from "next/link";
import { APP_CONFIG } from "@/config/app";
import { LogoMark } from "./LogoMark";

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="no-print mt-8 border-t-2 border-navy bg-bg pb-24 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-[0.9375rem] text-ink-3 md:flex-row md:items-center md:justify-between md:px-6">
        <p className="flex items-center gap-2">
          <LogoMark className="h-8" />
          <span>
            <span className="font-display text-[1.0625rem] font-extrabold uppercase text-navy">Ramblin’ Repairs</span>, campus maintenance for {APP_CONFIG.campusName}
          </span>
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li>
            Emergency?{" "}
            <a href={`tel:${APP_CONFIG.campusPolice.tel}`} className="font-bold text-ink-2 underline underline-offset-2">
              {APP_CONFIG.campusPolice.label} <span className="num">{APP_CONFIG.campusPolice.phone}</span>
            </a>
          </li>
          {!signedIn && (
            <>
              <li>
                <Link href="/login" className="font-bold text-ink-2 underline underline-offset-2">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="font-bold text-ink-2 underline underline-offset-2">
                  Create an account
                </Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </footer>
  );
}
