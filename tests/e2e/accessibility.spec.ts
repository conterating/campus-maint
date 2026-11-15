// axe-core WCAG 2.2 AA scans of every page, as each kind of user, plus
// keyboard checks for the things axe can't see.
import { expect, test } from "@playwright/test";
import { expectAccessible, resetDemo, viewAs } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetDemo(page);
  await page.close();
});

const PAGES: { user: string; paths: string[] }[] = [
  { user: "u-maya", paths: ["/", "/report", "/tickets", "/tickets?view=open", "/notifications", "/map", "/qr", "/my-tickets", "/my-tickets?tab=room", "/account", "/account/security"] },
  { user: "u-terrence", paths: ["/jobs", "/account", "/notifications"] },
  { user: "u-marcus", paths: ["/jobs"] },
  { user: "u-rosa", paths: ["/staff", "/staff?view=closed", "/qr?building=b-glenn", "/admin/contractors"] },
  { user: "u-linda", paths: ["/staff", "/admin/users"] },
  { user: "u-elena", paths: ["/admin", "/staff?dept=IT", "/admin/users", "/admin/contractors", "/admin/audit", "/demo", "/account/security"] },
];

// Signed-out pages.
for (const path of ["/", "/map", "/tickets", "/tickets?view=closed", "/login", "/login/contractor", "/login/staff", "/signup", "/forgot-password", "/reset-password", "/invite"]) {
  test(`signed out ${path} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, { exclude: [".leaflet-tile-pane"], disableRules: path === "/map" ? ["target-size"] : [] });
  });
}

for (const { user, paths } of PAGES) {
  for (const path of paths) {
    test(`${user} ${path} has no WCAG A/AA violations`, async ({ page, context }) => {
      await viewAs(context, user);
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Third-party OpenStreetMap tiles are decorative raster images outside our control.
      // On the map, pins in the same building can overlap at phone zoom levels. WCAG 2.5.8's
      // "equivalent" exception applies: the List view offers the same issues as full-size links.
      await expectAccessible(page, {
        exclude: [".leaflet-tile-pane"],
        disableRules: path === "/map" ? ["target-size"] : [],
      });
    });
  }
}

test("ticket pages (student and staff views) have no violations", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/tickets?view=mine");
  await page.getByRole("link", { name: /Two showers with no pressure/ }).click();
  await expectAccessible(page);
  await viewAs(context, "u-linda");
  await page.reload();
  for (const s of await page.locator("details summary").all()) await s.click();
  await expectAccessible(page);
});

test("a contractor's ticket page (with the work panel) has no violations", async ({ page, context }) => {
  await viewAs(context, "u-terrence");
  await page.goto("/jobs");
  await page.getByRole("link", { name: /Two showers with no pressure/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Your job" })).toBeVisible();
  await expectAccessible(page);
});

test("report review step has no violations", async ({ page, context }) => {
  await viewAs(context, "u-ethan");
  await page.goto("/report?building=b-library&space=s-lib-2study");
  await page.getByLabel("Describe the problem").fill("wifi keeps dropping here");
  await page.getByRole("button", { name: /Check and route it/ }).click();
  await expect(page.getByRole("heading", { name: "Here's how we'll route it" })).toBeVisible();
  await expectAccessible(page);
});

test("skip link moves focus to the main content", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("the whole report flow works with the keyboard alone", async ({ page, context }) => {
  await viewAs(context, "u-alex");
  await page.goto("/report");
  await page.getByLabel("Building").focus();
  await page.keyboard.type("Price"); // typeahead selects "Price Gilbert Memorial Library"
  await expect(page.getByLabel("Building")).not.toHaveValue("");
  await page.getByLabel("Describe the problem").focus();
  await page.keyboard.type("The hand dryer in the restroom is broken and does nothing.");
  await page.keyboard.press("Tab"); // the photo picker is next, and reachable by keyboard
  await expect(page.getByLabel(/Add a photo/)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Check and route it/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Here's how we'll route it" })).toBeFocused();
});

test("map pins are reachable by keyboard and open a popup with actions", async ({ page, context }) => {
  await viewAs(context, "u-ethan");
  await page.goto("/map");
  const pin = page.locator(".leaflet-marker-icon[title^='Treadmill 12 belt']");
  await pin.focus();
  await expect(pin).toBeFocused();
  await page.keyboard.press("Enter");
  const popup = page.locator(".leaflet-popup");
  await expect(popup.getByText("Treadmill 12 belt slipping and jerking")).toBeVisible();
  await expect(popup.getByRole("button", { name: /Me too/ })).toBeVisible();
  await expect(popup.getByRole("button", { name: /Follow/ })).toBeVisible();
});

test("interactive targets on the report page are at least 24×24 px", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/report");
  const small = await page.$$eval("main button, main a, main select, main textarea, main input:not(.sr-only)", (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => ({ text: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width < 24 || r.height < 24)
      .map(({ text, r }) => `${text} ${Math.round(r.width)}×${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
});
