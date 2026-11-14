import { expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export async function viewAs(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: "fixit_viewer", value: userId, url: "http://localhost:3200" }]);
}

/** Restore the sample data (and the real-time clock) through the demo page's own control. */
export async function resetDemo(page: Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Yes, reset everything" }).click();
  await expect(page.getByText("Demo data reset.")).toBeVisible({ timeout: 20_000 });
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
