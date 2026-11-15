import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createOTP } from "@better-auth/utils/otp";
import { USERS } from "../../src/lib/seed/data";

export const PASSWORD = "buzz-fixes-everything";
export const ADMIN_TOTP_SECRET = "RamblinReprsDemoTotpSecret2026xx";
const AUTH_DIR = path.join(process.cwd(), "tests/e2e/.auth");
const OUTBOX = path.join(process.cwd(), ".mail/outbox.jsonl");

export const usernameOf = (userId: string) => {
  const u = USERS.find((x) => x.id === userId);
  if (!u) throw new Error(`Unknown seed user ${userId}`);
  return u;
};

export function tabFor(role: string) {
  return role === "CONTRACTOR" ? "/login/contractor" : role === "STAFF" || role === "ADMIN" ? "/login/staff" : "/login";
}

export async function totp(secret = ADMIN_TOTP_SECRET) {
  return createOTP(secret).totp();
}

/** Sign in through the real login form. */
export async function loginWithForm(page: Page, username: string, opts: { password?: string; tab?: string; totpSecret?: string } = {}) {
  await page.goto(opts.tab ?? "/login");
  await page.locator("#username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(opts.password ?? PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  if (opts.totpSecret) {
    await expect(page.getByLabel("Verification code")).toBeVisible();
    await page.getByLabel("Verification code").fill(await totp(opts.totpSecret));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Sign in as a seeded user. The first time in a run this goes through the login
 * form and saves the Playwright storageState; later calls reuse it.
 */
export async function signInAs(context: BrowserContext, userId: string, usePage?: Page) {
  const u = usernameOf(userId);
  mkdirSync(AUTH_DIR, { recursive: true });
  const file = path.join(AUTH_DIR, `${userId}.json`);
  await context.clearCookies();
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
    await context.addCookies(state.cookies);
    return;
  }
  // Pages from browser.newPage() can't open a second page in their context, so reuse one if given.
  const page = usePage ?? (await context.newPage());
  await loginWithForm(page, u.username, { tab: tabFor(u.role), totpSecret: u.role === "ADMIN" ? ADMIN_TOTP_SECRET : undefined });
  await context.storageState({ path: file });
  if (!usePage) await page.close();
}

/** Back-compat name used by the older specs. */
export const viewAs = signInAs;

/** Restore the sample data (and the real-time clock) through the admin's demo page. */
export async function resetDemo(page: Page) {
  await signInAs(page.context(), "u-elena", page);
  await page.goto("/demo");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Yes, reset everything" }).click();
  await expect(page.getByText("Demo data reset.")).toBeVisible({ timeout: 30_000 });
}

/** The most recent link emailed to an address (development mailer). */
export async function lastEmailLink(to: string, kind: "verify" | "reset" | "invite"): Promise<string> {
  await expect.poll(() => (existsSync(OUTBOX) ? readFileSync(OUTBOX, "utf8") : ""), { timeout: 10_000 }).toContain(to);
  const lines = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; kind: string; link: string });
  const hit = lines.reverse().find((m) => m.to === to && m.kind === kind);
  if (!hit) throw new Error(`No ${kind} email to ${to}`);
  return hit.link;
}

/** Fail on any WCAG 2.2 A/AA violation. */
export async function expectAccessible(page: Page, opts: { exclude?: string[]; disableRules?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const results = await builder.analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`);
  expect(summary, summary.join("\n")).toEqual([]);
}
