import Link from "next/link";
import { APP_CONFIG } from "@/config/app";
import { LogoMark } from "./LogoMark";

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="no-print border-t border-line bg-surface pb-24 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-ink-3 md:flex-row md:items-center md:justify-between">
        <p className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span>
            <span className="font-bold text-ink-2">Ramblin’ Repairs</span> · campus maintenance for {APP_CONFIG.campusName}
          </span>
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li>
            Emergency?{" "}
            <a href={`tel:${APP_CONFIG.campusPolice.tel}`} className="font-bold text-ink-2 underline underline-offset-2">
              {APP_CONFIG.campusPolice.label} {APP_CONFIG.campusPolice.phone}
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
