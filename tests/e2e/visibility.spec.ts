// Visibility rules as a student actually experiences them in the browser.
import { expect, test } from "@playwright/test";
import { resetDemo, viewAs } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetDemo(page);
  await page.close();
});

async function glennRoomTicketUrl(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  await viewAs(context, "u-maya");
  await page.goto("/tickets?view=mine");
  await page.getByRole("link", { name: /Desk drawer off its track/ }).click();
  await expect(page).toHaveURL(/\/tickets\/c/);
  return page.url();
}

test("a dorm-room ticket opens for its residents and 404s for everyone else", async ({ page, context }) => {
  const url = await glennRoomTicketUrl(page, context);

  await viewAs(context, "u-jordan"); // roommate
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Desk drawer");

  for (const outsider of ["u-ethan", "u-sam", "u-alex"]) {
    await viewAs(context, outsider);
    const res = await page.goto(url);
    expect(res?.status(), outsider).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }

  await viewAs(context, "u-aisha"); // staff from another department can still see it
  await page.goto(url);
  await expect(page.getByText("This ticket belongs to Housing Maintenance.")).toBeVisible();
});

test("a contractor sees only jobs assigned to them", async ({ page, context }) => {
  const url = await glennRoomTicketUrl(page, context); // resolved by Terrence long ago
  await viewAs(context, "u-marcus"); // Facilities contractor, not on this job
  expect((await page.goto(url))?.status()).toBe(404);
  await page.goto("/tickets?view=open");
  await expect(page).toHaveURL(/\/jobs$/);
  await viewAs(context, "u-terrence");
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Desk drawer");
  // Only the reporter's first name, and the room.
  await expect(page.getByText(/by Maya$/)).toBeVisible();
  await expect(page.getByText("Patel")).toHaveCount(0);
});

test("an off-campus student sees no dorm issues in lists or on the map", async ({ page, context }) => {
  await viewAs(context, "u-alex");
  await page.goto("/tickets?view=open");
  await expect(page.getByRole("link", { name: /Residence Hall|Apartments|Houses|Graduate Living|Tenth and Home/ })).toHaveCount(0);

  await page.goto("/map");
  await page.getByRole("button", { name: "List" }).click();
  const list = page.getByRole("region", { name: "List of issues" });
  await expect(list.getByRole("listitem").first()).toBeVisible();
  await expect(list.getByText(/Residence Hall|Apartments|Houses|Graduate Living|Tenth and Home/)).toHaveCount(0);
  await expect(page.getByText(/Showing \d+ of \d+ issues you can see/)).toBeVisible();
});

test("a resident sees their own hall's shared-area issues on the map, but not other halls'", async ({ page, context }) => {
  await viewAs(context, "u-ethan");
  await page.goto("/map");
  await page.getByRole("button", { name: "List" }).click();
  const list = page.getByRole("region", { name: "List of issues" });
  await expect(list.getByText("Glenn elevator grinding and shaking between floors 2–3")).toBeVisible();
  await expect(list.getByText(/Towers Residence Hall/)).toHaveCount(0);
  await expect(list.getByText(/Glenn Residence Hall, Room 214/)).toHaveCount(0); // Maya's room
});

test("a QR code for someone else's hall explains why it can't be used", async ({ page, context }) => {
  await viewAs(context, "u-sam"); // Towers resident
  await page.goto("/report?building=b-glenn&space=s-gln-laundry&asset=a-gln-w3");
  await expect(page.locator("main").getByRole("alert")).toContainText("only report issues in the residence hall you live in");
  await expect(page.getByLabel("Building").locator("option", { hasText: "Glenn" })).toHaveCount(0);
});

test("a QR code on equipment pre-fills the whole location", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/report?qr=1&building=b-glenn&space=s-gln-laundry&asset=a-gln-w3");
  await expect(page.getByText("Scanned a QR code.")).toBeVisible();
  await expect(page.getByLabel("Building")).toHaveValue("b-glenn");
  await expect(page.getByLabel("Room or area (optional)")).toHaveValue("s-gln-laundry");
  await expect(page.getByLabel("Equipment (optional)")).toHaveValue("a-gln-w3");

  await page.getByLabel("Describe the problem").fill("It stopped in the middle of the cycle again.");
  await page.getByRole("button", { name: /Check and route it/ }).click();
  // The equipment alone tells triage it's an appliance, and finds the open washer ticket.
  await expect(page.getByLabel("Category")).toHaveValue("APPLIANCE");
  await expect(page.getByRole("region", { name: "Already reported?" }).getByText("Washer 3 stops mid-cycle and won't drain")).toBeVisible();
});

test("safety words trigger the emergency banner with the police number and lock severity", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/report?building=b-glenn&space=s-gln-214");
  await page.getByLabel("Describe the problem").fill("There is smoke coming out of the outlet behind my desk.");
  await page.getByRole("button", { name: /Check and route it/ }).click();
  const banner = page.getByRole("alert").filter({ hasText: "Emergency" });
  await expect(banner).toContainText("Smoke or fire");
  await expect(banner.getByRole("link", { name: "404-894-2500" })).toHaveAttribute("href", "tel:+14048942500");
  await expect(page.getByRole("radio", { name: /Emergency/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Low/ })).toBeDisabled();
});
