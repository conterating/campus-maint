// Comments with photos, as students and staff use them in the browser.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { expectAccessible, resetDemo, viewAs } from "./helpers";

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await resetDemo(page);
  await page.close();
});

// A real 1×1 PNG, so the server's magic-byte check accepts it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");

async function projectorTicketUrl(page: Page, context: BrowserContext) {
  await viewAs(context, "u-alex"); // reported it
  await page.goto("/tickets?view=mine");
  await page.getByRole("link", { name: /Room 249 projector/ }).click();
  await expect(page).toHaveURL(/\/tickets\/c/);
  return page.url();
}

test("a student adds a comment with a photo, and other people can see it", async ({ page, context }, info) => {
  const text = `Still won't turn on, and the cable looks frayed (${info.project.name})`;
  const url = await projectorTicketUrl(page, context);

  await viewAs(context, "u-ethan");
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Follow for updates" })).toBeVisible();
  await page.getByLabel("Add a comment").fill(text);
  await page.getByLabel("Add photos").setInputFiles({ name: "projector.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Photo 1 to attach" })).toBeVisible();
  await expect(page.getByText("1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Post comment" }).click();

  await expect(page.getByText("Comment posted.")).toBeVisible();
  const comment = page.locator("ol > li", { hasText: text });
  await expect(comment).toContainText("You");
  const img = comment.getByRole("img", { name: /Photo attached to this comment/ });
  await expect(img).toBeVisible();
  const served = await page.request.get((await img.getAttribute("src"))!);
  expect(served.headers()["content-type"]).toBe("image/png");
  // The form clears, and commenting followed the ticket.
  await expect(page.getByLabel("Add a comment")).toHaveValue("");
  await expect(page.getByRole("button", { name: /Following/ })).toBeVisible();
  await expectAccessible(page);

  // Another student sees it without Ethan's name.
  await viewAs(context, "u-maya");
  await page.goto(url);
  await expect(page.locator("ol > li", { hasText: text })).toContainText("A student");

  // The reporter gets an alert about it.
  await viewAs(context, "u-alex");
  await page.goto("/notifications");
  await expect(page.getByText(/New comment on RR-\d+ \(with a photo\): Still won't turn on/).first()).toBeVisible();

  // Staff see the commenter's name.
  await viewAs(context, "u-aisha");
  await page.goto(url);
  await expect(page.locator("ol > li", { hasText: text })).toContainText("Ethan B.");
});

test("an empty comment explains what's missing instead of posting", async ({ page, context }) => {
  const url = await projectorTicketUrl(page, context);
  await page.goto(url);
  const before = await page.locator("ol > li").count();
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Write a comment or add a photo first.")).toBeVisible();
  await expect(page.locator("ol > li")).toHaveCount(before);
});
