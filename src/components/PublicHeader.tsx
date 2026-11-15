import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Wordmark } from "./LogoMark";
import { TopNav } from "./NavLinks";

/**
 * The site header for visitors who aren't signed in: the same navy bar as the
 * app, with public tabs (Home, Map, Issues) and Sign in as its own tab.
 */
export function PublicHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b-[3px] border-buzz bg-navy text-white">
      <div className="mx-auto flex h-[61px] max-w-6xl items-center gap-2 px-4 md:gap-4 md:px-6">
        <Link href="/" className="logo-swing flex items-center gap-2.5 pr-1">
          <Wordmark />
        </Link>
        <div className="ml-6 hidden flex-1 self-stretch md:block">
          <TopNav role="GUEST" />
        </div>
        <div className="flex-1 md:hidden" />
        <Link href="/signup" className="btn btn-accent btn-sm">
          <UserPlus aria-hidden className="size-4" />
          <span className="hidden min-[400px]:inline">Create account</span>
          <span className="min-[400px]:hidden">Sign up</span>
        </Link>
      </div>
    </header>
  );
}
