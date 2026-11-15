// Accounts in a real browser: sign-up and email verification, each role's
// sign-in, contractor work, staff dispatch, admin 2FA, password reset, the
// keyboard, and the GT SSO placeholder.
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, ADMIN_TOTP_SECRET, expectAccessible, lastEmailLink, loginWithForm, resetDemo, signInAs, totp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
  await page.context().clearCookies();
});

async function signOut(page: Page) {
  await page.getByRole("button", { name: /account menu/ }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  // Back to the public site, with Sign in as a tab.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
}

test("student: sign up, verify from the email link, sign in, report, sign out", async ({ page }, info) => {
  const username = `gp${info.project.name === "mobile" ? "m" : "d"}${Date.now() % 1_000_000}`;
  const gtId = `90${String(Date.now()).slice(-7)}`;
  await page.goto("/signup");
  await page.getByLabel("First name").fill("George");
  await page.getByLabel("Last name").fill("Burdell");
  await page.getByLabel("Year").selectOption("SECOND");
  await page.getByLabel("Gender (optional)").selectOption("PREFER_NOT_TO_SAY");
  await page.getByLabel("GT username").fill(username);
  await expect(page.getByText(`Your email will be ${username}@gatech.edu`)).toBeVisible();
  await page.getByLabel("GT ID", { exact: true }).fill(gtId);
  await page.getByLabel("Residence hall").selectOption("b-glenn");
  await page.getByLabel("Room number").fill("216");
  await expect(page.getByText("Create a password for Ramblin' Repairs. Don't reuse your Georgia Tech password.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("ramblin wreck from tech");
  await page.getByLabel("Retype password").fill("ramblin wreck from tech");
  await page.getByLabel(/I agree to the Ramblin/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your GT email to finish signing up." })).toBeVisible();

  // Can't sign in until the email is confirmed.
  await loginAttempt(page, username, "ramblin wreck from tech");
  await expect(page.getByText("Check your email to finish setting up your account.")).toBeVisible();

  await page.goto(await lastEmailLink(`${username}@gatech.edu`, "verify"));
  await expect(page).toHaveURL(/\/login\?verified=1/);
  await expect(page.getByText("Your email is confirmed. Sign in to continue.")).toBeVisible();
  await loginWithForm(page, username, { password: "ramblin wreck from tech" });
  await expect(page).toHaveURL(/\/$/);
  // The room isn't confirmed yet, so the banner shows and only public buildings are open.
  await expect(page.getByText("Housing is confirming your room. Until then you can report issues in public buildings.")).toBeVisible();

  await page.goto("/report?building=b-library&space=s-lib-1rest");
  await page.getByLabel("Describe the problem").fill("The hand dryer in the first floor restroom is broken.");
  await page.getByRole("button", { name: /Check and route it/ }).click();
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText(/Filed as RR-\d+/)).toBeVisible();
  await page.goto("/my-tickets");
  await expect(page.getByRole("link", { name: /hand dryer/i }).filter({ visible: true })).toBeVisible();
  await signOut(page);
  expect((await page.goto("/my-tickets"))?.url()).toMatch(/\/login\?next=%2Fmy-tickets/);
});

/** Test fixture: un-dispatch one assigned Facilities ticket in the e2e database (the real unassigned state auto-assign avoids). */
async function returnOneFacilitiesTicketToQueue() {
  const db = new PrismaClient({ datasourceUrl: "file:./e2e.db" });
  try {
    const t = await db.ticket.findFirstOrThrow({ where: { department: "FACILITIES", status: "ASSIGNED", assigneeId: { not: null } }, orderBy: { number: "desc" } });
    await db.scheduledJob.deleteMany({ where: { ticketId: t.id } });
    await db.ticket.update({ where: { id: t.id }, data: { status: "TRIAGED", assigneeId: null } });
  } finally {
    await db.$disconnect();
  }
}

async function loginAttempt(page: Page, username: string, password: string, tab = "/login") {
  await page.goto(tab);
  await page.locator("#username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("contractor: sign in on the Contractor tab, start and finish a job, and the student sees it resolved", async ({ page, context }) => {
  await loginWithForm(page, "twallace", { tab: "/login/contractor" });
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "My jobs" })).toBeVisible();
  await page.getByRole("link", { name: /Two showers with no pressure/ }).filter({ visible: true }).first().click();
  // Already in progress from the seeded history: the open work log is waiting to be finished.
  await expect(page.getByText(/Working since/)).toBeVisible();
  await page.getByLabel("Materials used (optional)").fill("Two shower cartridges");
  await page.getByLabel("Materials cost in dollars (optional)").fill("38.40");
  await page.getByLabel("What you did").fill("Replaced both cartridges. Pressure is back.");
  await page.getByRole("button", { name: "Finish and mark resolved" }).click();
  await expect(page.getByText(/Marked resolved/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work log" })).toBeVisible();
  await expect(page.getByText("Materials $38.40")).toBeVisible();
  const url = page.url();

  await signInAs(context, "u-jordan"); // reported it
  await page.goto(url);
  await expect(page.getByText("Resolved").first()).toBeVisible();
  await expect(page.getByText("Replaced both cartridges. Pressure is back.").first()).toBeVisible();
  // Students never see costs.
  await expect(page.getByText("$38.40")).toHaveCount(0);
});

test("staff: assign a ticket to a contractor, and the contractor sees it", async ({ page, context }, info) => {
  test.skip(info.project.name === "mobile", "The queue's quick-assign column is desktop-only; phones assign from the ticket page (demo script).");
  // The scheduler now dispatches every waiting ticket on its own, so put one Facilities job back in the queue.
  await returnOneFacilitiesTicketToQueue();
  await loginWithForm(page, "rdelgado7", { tab: "/login/staff" });
  await expect(page).toHaveURL(/\/staff$/);
  // The first unassigned Facilities ticket in the queue: only eligible contractors are offered.
  const picker = page.getByLabel(/^Assign RR-\d+ to$/).filter({ visible: true }).first();
  await expect(picker).toBeVisible();
  const id = (await picker.getAttribute("id"))!;
  const num = (await page.locator(`label[for="${id}"]`).textContent())!.match(/RR-\d+/)![0];
  await expect(picker.locator("option", { hasText: "Victor" })).toHaveCount(0); // background check pending
  await picker.selectOption({ label: (await picker.locator("option", { hasText: "Marcus B." }).textContent())! });
  await page.getByRole("button", { name: `Assign ${num}`, exact: true }).filter({ visible: true }).click();
  await expect(page.getByLabel(`Assign ${num} to`).filter({ visible: true })).toHaveCount(0);

  await signInAs(context, "u-marcus");
  await page.goto("/jobs");
  await expect(page.getByText(num).first()).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByRole("link", { name: new RegExp(`New job: ${num}`) }).first()).toBeVisible();
});

test("admin: sign in with 2FA, create a contractor, and the audit log shows it", async ({ page }, info) => {
  await loginAttempt(page, "evasquez1", PASSWORD, "/login/staff");
  await expect(page.getByLabel("Verification code")).toBeVisible();
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("That code didn't work.").first()).toBeVisible();
  await page.getByLabel("Verification code").fill(await totp(ADMIN_TOTP_SECRET));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const user = `ana${info.project.name[0]}${Date.now() % 100000}`;
  await page.goto("/admin/contractors");
  await page.getByRole("button", { name: "Add contractor" }).click();
  await page.getByLabel("First name").fill("Ana");
  await page.getByLabel("Last name").fill("Lopez");
  await page.getByLabel("Badge or vendor number").fill(`C-${user}`);
  await page.getByLabel("Contractor username").fill(user);
  await page.getByLabel("Email", { exact: true }).fill(`${user}@lopezhvac.test`);
  await page.getByLabel("Company", { exact: true }).fill("Lopez HVAC");
  await page.getByRole("checkbox", { name: "Heating & cooling", exact: true }).check();
  await page.getByRole("checkbox", { name: "Facilities", exact: true }).check();
  await page.getByLabel("License expires").fill("2030-01-31");
  await page.getByLabel("Insurance expires").fill("2030-01-31");
  await page.getByLabel("Background check").selectOption("CLEARED");
  await page.getByRole("button", { name: "Create and send invite" }).click();
  await expect(page.getByText(`Contractor Ana Lopez created. We emailed them an invite.`)).toBeVisible();

  await page.goto("/admin/audit?action=CONTRACTOR_CREATED");
  await expect(page.getByRole("cell", { name: /Ana Lopez/ }).first()).toBeVisible();

  // The invite link sets a password and the contractor can sign in.
  await page.context().clearCookies();
  await page.goto(await lastEmailLink(`${user}@lopezhvac.test`, "invite"));
  await page.getByLabel("New password", { exact: true }).fill("lopez hvac secure pass");
  await page.getByLabel("Retype new password").fill("lopez hvac secure pass");
  await page.getByRole("button", { name: "Create password" }).click();
  await expect(page).toHaveURL(/invited=1/);
  await loginWithForm(page, user, { password: "lopez hvac secure pass", tab: "/login/contractor" });
  await expect(page).toHaveURL(/\/jobs$/);
});

test("forgot password, reset from the email link, then sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("hali3");
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByText(/If there's an account for that username, we sent a reset link/)).toBeVisible();
  await page.goto(await lastEmailLink("hali3@gatech.edu", "reset"));
  await page.getByLabel("New password", { exact: true }).fill("hali3 is my password");
  await page.getByLabel("Retype new password").fill("hali3 is my password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password can't contain your username.").first()).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("graduate living center");
  await page.getByLabel("Retype new password").fill("graduate living center");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);
  await loginAttempt(page, "hali3", PASSWORD);
  await expect(page.getByText("Username or password is incorrect.")).toBeVisible();
  await loginWithForm(page, "hali3", { password: "graduate living center" });
  await expect(page).toHaveURL(/\/$/);
});

test("signed out, the site is browsable with Sign in as a tab; signed in, the profile menu has profile, tickets and log out", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Report it once. Watch it get fixed." })).toBeVisible();
  // Sign in is a header button on desktop and a bottom tab on phones.
  const signIn = page.locator('header, nav[aria-label="Main"]').getByRole("link", { name: "Sign in", exact: true }).filter({ visible: true }).first();
  await expect(signIn).toBeVisible();
  // Public issues only, and no actions without signing in.
  await page.goto("/tickets");
  await expect(page.getByRole("heading", { level: 1, name: "Issues on campus" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Residence Hall|Apartments/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Wi-Fi dropping every few minutes/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "Have this problem too?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Me too/ })).toHaveCount(0);
  await signIn.click();
  await expect(page).toHaveURL(/\/login/);
  await expect(signIn).toHaveAttribute("aria-current", "page");

  await loginWithForm(page, "mpatel3");
  await page.getByRole("button", { name: /account menu/ }).click();
  await expect(page.getByRole("link", { name: "View profile" })).toBeVisible();
  await page.getByRole("link", { name: "Current tickets" }).click();
  await expect(page).toHaveURL(/\/my-tickets$/);
  await page.getByRole("button", { name: /account menu/ }).click();
  await page.getByRole("link", { name: "View profile" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await signOut(page);
  void info;
});

test("a correct login on the wrong tab still signs in by real role", async ({ page }) => {
  await loginWithForm(page, "LOKAFOR3@gatech.edu", { tab: "/login" });
  await expect(page).toHaveURL(/\/staff$/);
});

for (const [tab, path, username, home] of [
  ["Student", "/login", "nthompson8", /\/$/],
  ["Contractor", "/login/contractor", "bhollis", /\/jobs$/],
  ["Staff & Administrator", "/login/staff", "ohaddad2", /\/staff$/],
] as const) {
  test(`keyboard-only sign-in on the ${tab} tab`, async ({ page }) => {
    await page.goto("/login");
    // Reach the tablist and pick the tab with the arrow keys.
    const first = page.getByRole("tab", { name: "Student" });
    await first.focus();
    const steps = tab === "Student" ? 0 : tab === "Contractor" ? 1 : 2;
    for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: tab })).toBeFocused();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.keyboard.press("Tab");
    await expect(page.locator("#username")).toBeFocused();
    await page.keyboard.type(username);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(home);
  });
}

test("the GT SSO button is visible and focusable but does nothing", async ({ page }) => {
  for (const path of ["/login", "/login/staff"]) {
    await page.goto(path);
    const sso = page.getByRole("button", { name: "Sign in with Georgia Tech SSO" });
    await expect(sso).toBeVisible();
    await expect(sso).toHaveAttribute("aria-disabled", "true");
    await expect(sso).not.toHaveAttribute("disabled");
    await expect(sso).toHaveAccessibleDescription("Coming soon");
    await sso.focus();
    await expect(sso).toBeFocused();
    // Let Next.js finish prefetching the nav links first; then any request would come from the button.
    await page.waitForLoadState("networkidle");
    const requests: string[] = [];
    page.on("request", (r) => {
      if (!r.headers()["next-router-prefetch"]) requests.push(r.url());
    });
    const before = page.url();
    // aria-disabled buttons look disabled to Playwright, so force the click a user could still make.
    await sso.click({ force: true });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await page.waitForTimeout(500);
    expect(page.url()).toBe(before);
    expect(requests).toEqual([]);
  }
  await page.goto("/login/contractor");
  await expect(page.getByRole("button", { name: "Sign in with Georgia Tech SSO" })).toHaveCount(0);
});

test("a failed sign-in moves focus to the error summary", async ({ page }) => {
  await loginAttempt(page, "mpatel3", "definitely wrong password");
  await expect(page.getByRole("alert").filter({ hasText: "Username or password is incorrect." })).toBeFocused();
  await expectAccessible(page);
});
