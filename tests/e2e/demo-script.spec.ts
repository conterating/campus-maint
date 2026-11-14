// The five beats of the 3-minute demo, end to end in a real browser.
import { expect, test } from "@playwright/test";
import { resetDemo, viewAs } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test("1–2. a student reports a leak in their dorm room and it is classified and routed instantly", async ({ page, context }) => {
  await viewAs(context, "u-maya");
  await page.goto("/report");
  await page.getByRole("button", { name: "My room" }).click();
  await expect(page.getByLabel("Room or area (optional)")).toHaveValue("s-gln-214");
  await expect(page.getByText("only you, your roommates, and staff can see this report")).toBeVisible();

  await page.getByLabel("Describe the problem").fill("Water is leaking from under the bathroom sink and pooling on the floor.");
  await page.getByRole("button", { name: /Check and route it/ }).click();

  const review = page.getByRole("region", { name: "Here's how we'll route it" });
  await expect(page.getByRole("heading", { name: "Here's how we'll route it" })).toBeFocused();
  await expect(review.getByText("Housing Maintenance")).toBeVisible();
  await expect(review.getByLabel("Category")).toHaveValue("PLUMBING");
  await expect(review.getByRole("radio", { name: /Urgent/ })).toBeChecked();
  await expect(review.getByText("first response within")).toContainText("4 hours");

  // Correcting the category re-routes before submission.
  await review.getByLabel("Category").selectOption("NETWORK");
  await expect(review.getByText("IT", { exact: true })).toBeVisible();
  await review.getByLabel("Category").selectOption("PLUMBING");

  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page).toHaveURL(/\/tickets\/.+created=1/);
  await expect(page.getByText(/Filed as RR-\d+/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("leaking from under the bathroom sink");
  await expect(page.getByText("You (it's in your room)")).toBeVisible();
  await expect(page.getByText("Private to the residents of this room and staff.")).toBeVisible();
  await expect(page.getByText(/Response due in 3h 5\dm|Response due in 4h/)).toBeVisible();
});

test("3. staff update the student's ticket and the student is notified", async ({ page, context }) => {
  // Maya files the report.
  await viewAs(context, "u-maya");
  await page.goto("/report?building=b-glenn&space=s-gln-214");
  await page.getByLabel("Describe the problem").fill("Water is leaking from under the bathroom sink and pooling on the floor.");
  await page.getByRole("button", { name: /Check and route it/ }).click();
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page).toHaveURL(/\/tickets\//);
  const ticketUrl = page.url().split("?")[0];
  const num = (await page.getByText(/Filed as RR-\d+/).textContent())!.match(/RR-\d+/)![0];

  // Terrence (Housing) sees it in his queue and takes it.
  await viewAs(context, "u-terrence");
  await page.goto("/staff");
  await expect(page.getByRole("link", { name: /leaking from under the bathroom sink/ }).filter({ visible: true })).toBeVisible();
  await page.goto(ticketUrl);
  await page.getByLabel("New status").selectOption("ASSIGNED");
  await page.getByLabel("Message to the reporter (optional)").fill("On my way with a new trap.");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText(/Updated to assigned/)).toBeVisible();
  await expect(page.getByText("Assigned to Terrence W. — On my way with a new trap.")).toBeVisible();
  await expect(page.getByText("Responded within target")).toBeVisible();

  await page.getByLabel("New status").selectOption("RESOLVED");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText(/Updated to resolved/)).toBeVisible();

  // Maya gets the alerts and confirms the fix.
  await viewAs(context, "u-maya");
  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: `Unread. ${num} is resolved. Check it and confirm, or reopen it.` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Unread. ${num} is now assigned (Terrence W.)` })).toBeVisible();
  await page.goto(ticketUrl);
  await page.getByRole("button", { name: "Yes, it's fixed" }).click();
  await expect(page.getByText("Thanks! Marked as confirmed.")).toBeVisible();
  await expect(page.locator("li[aria-current=step]")).toHaveText("Confirmed (current)");
});

test("4. a second student hits the duplicate check on a public issue and says me too", async ({ page, context }) => {
  await viewAs(context, "u-ethan");
  await page.goto("/report");
  await page.getByLabel("Building").selectOption("b-library");
  await page.getByLabel("Room or area (optional)").selectOption("s-lib-2study");
  await page.getByLabel("Describe the problem").fill("The wifi keeps disconnecting in the 2nd floor quiet study.");
  await page.getByRole("button", { name: /Check and route it/ }).click();

  const dups = page.getByRole("region", { name: "Already reported?" });
  await expect(dups).toBeVisible();
  await expect(dups.getByText("Wi-Fi dropping every few minutes, library 2nd floor quiet study")).toBeVisible();
  await expect(dups.getByText("5 me too")).toBeVisible();
  await dups.getByRole("button", { name: /Me too/ }).click();

  await expect(page).toHaveURL(/metoo=1/);
  await expect(page.getByText("You're counted.")).toBeVisible();
  await expect(page.getByText("You said “me too” on this.")).toBeVisible();
  await expect(page.getByText("7 people affected", { exact: true })).toBeVisible(); // reporter + 6
  await expect(page.getByRole("button", { name: /Following/ })).toHaveAttribute("aria-pressed", "true");
});

test("5. an overdue ticket escalates to the supervisor when the clock moves forward", async ({ page, context }) => {
  await viewAs(context, "u-aisha"); // IT supervisor
  await page.goto("/staff");
  const queueItem = () => page.getByRole("link", { name: /Room 249 projector/ }).filter({ visible: true }).first();
  await expect(queueItem()).toBeVisible();
  // ~45 minutes left (the countdown sits in the same row/card)
  await expect(page.getByText(/Response due in 4\dm/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Escalated to you" })).toHaveCount(0);

  await page.goto("/demo");
  await page.getByRole("button", { name: "+1 hour" }).click();
  await expect(page.getByText(/Clock moved 1 hour ahead\. \d+ overdue tickets? escalated\./)).toBeVisible();

  await page.goto("/staff");
  await expect(page.getByRole("region", { name: "Escalated to you" }).getByRole("link", { name: /Room 249 projector/ })).toBeVisible();
  await expect(queueItem()).toBeVisible();
  await expect(page.getByText(/Overdue \d+m/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Alerts, \d+ unread/ })).toBeVisible();

  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: /Room 249 projector won't turn on before 2pm class missed its 4h response target/ })).toBeVisible();

  await page.getByRole("link", { name: /Room 249 projector won't turn on/ }).first().click();
  await expect(page.getByText("Escalated", { exact: true })).toBeVisible();
  await expect(page.getByText(/No response within the 4-hour target\. Escalated to the IT supervisor \(Aisha R\.\)/)).toBeVisible();
});
