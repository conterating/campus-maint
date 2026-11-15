# Ramblin’ Repairs

One place for Georgia Tech students to report, track, and see campus maintenance issues.

Today a student has to know whether a broken thing belongs to Housing, Facilities, or IT, gets little visibility into what happens next, and waits days for someone to classify and route the request. Ramblin’ Repairs classifies and routes each report in seconds (Claude, with a keyword fallback), shows live status with response-time countdowns, and puts open issues on a campus map so people add a "me too" instead of filing duplicates.

This is a campus solution challenge demo with realistic sample data. It does not connect to Georgia Tech's real systems.

## Quick start

Requirements: Node.js 20 or newer (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env
npm run setup        # fills in BETTER_AUTH_SECRET, generates the Prisma client, creates prisma/dev.db, seeds sample data
npm run dev          # http://localhost:3000 → sign in (see "Accounts and sign-in" below)
```

Environment variables (`.env`):

| Variable | Needed? | What it does |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file, relative to `prisma/schema.prisma`. Default `file:./dev.db`. |
| `BETTER_AUTH_SECRET` | yes | Signs sessions and encrypts two-factor secrets. `npm run setup` generates one if it's empty (or use `openssl rand -base64 32`). Changing it signs everyone out and breaks enrolled authenticators; run `npm run db:reset` afterwards. |
| `BETTER_AUTH_URL` | yes | The URL people open the app at (`http://localhost:3000` locally). Used in email links and as the trusted origin for Better Auth's CSRF checks. Cookies are `Secure` when it's https. |
| `RESEND_API_KEY` | no | Sends verification, password-reset and invite emails through [Resend](https://resend.com). Without it, emails are printed in the `npm run dev` terminal and appended to `.mail/outbox.jsonl`, so you can click the links yourself. |
| `EMAIL_FROM` | no | Sender for those emails, e.g. `Ramblin' Repairs <repairs@yourdomain.edu>`. |
| `DEMO_MODE` | no | `true` keeps the Demo page (view as, fast-forward clock, reset data) for signed-in administrators. Use `false` for anything real. |
| `SEED_DEMO_PASSWORD` | no | Password for every seeded account (12+ characters). Defaults to `buzz-fixes-everything`. |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `TRIAGE_SIGNING_SECRET`, `PUBLIC_BASE_URL`, `GOOGLE_MAPS_API_KEY` | no | See the sections below. |

npm 11 blocks dependency install scripts by default. `package.json` already approves the four that are needed (Prisma's engines and esbuild). If your npm asks anyway, run `npm install-scripts approve @prisma/client @prisma/engines prisma esbuild`.

To start over with fresh sample data at any time, run `npm run db:reset`, or use **Reset demo data** on the in-app Demo page.

### Claude triage (optional)

Set these in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5-5   # any Claude model id
```

Without a key, Ramblin’ Repairs classifies reports with its keyword rules (`src/lib/triage/keywords.ts`), so everything works end to end. If the API call fails or times out (25 s), the app falls back to the keyword rules and says so on the review screen. With a key, the report text and photo go to Claude using structured output at low effort, with the API's server-side refusal fallback enabled (`fallbacks: "default"`).

### Google Maps (optional)

The campus map uses Google Maps when you set a browser key for the **Maps JavaScript API** in `.env`:

```bash
GOOGLE_MAPS_API_KEY=AIza...
```

Restrict the key to your site's domain (HTTP referrers) in Google Cloud, since browsers can see it. Without a key the map uses OpenStreetMap tiles, and everything else works the same.

## Deploying to Vercel

Locally the app keeps its data in a SQLite file and photos in `uploads/`. Vercel's filesystem is read-only and isn't shared between requests, so a deployment uses two hosted services instead: **Turso** (hosted SQLite, so the schema and queries are unchanged) and **Vercel Blob** (for photos). The app switches to them automatically when their environment variables are present; nothing else changes.

1. **Import the repo** in Vercel (Add New → Project). Framework preset **Next.js**; leave the root directory, build command (`npm run build` already runs `prisma generate`), output and install settings at their defaults.
2. **Add a database:** in the project, Storage → Marketplace → **Turso Cloud** → create a database and connect it to the project. Pick a region close to your Vercel functions' region (Settings → Functions); every query is a round trip. This sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. **Add photo storage:** Storage → **Blob** → create a store, choose **Private** access, and connect it to the project. This sets `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN` on older stores); either one works. (If you chose Public, also add `BLOB_ACCESS=public`.)
4. **Add environment variables** (Settings → Environment Variables):
   - `TRIAGE_SIGNING_SECRET`: **required.** A long random string (`openssl rand -hex 32`). Without it, Vercel's separate function instances can't verify each other's signatures, and reports quietly record the keyword classification instead of Claude's.
   - `ANTHROPIC_API_KEY` (optional): turns on Claude triage.
   - `GOOGLE_MAPS_API_KEY` (optional): restrict it to your `*.vercel.app` domain in Google Cloud.
   - `PUBLIC_BASE_URL`: your site's address, so printed QR codes point at it.
5. **Load the schema and demo data once**, from your laptop. Copy the two Turso values from the Vercel project's environment variables (don't put them in your local `.env`):
   ```bash
   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:hosted:reset
   ```
   It drops every table, recreates the schema from `prisma/schema.prisma` and loads the sample data. Run it again after any schema change.
6. **Deploy** (or redeploy, so the new variables apply).

Notes:
- **Reset demo data** on the live site replays the whole seed (about 3,300 SQL statements) over the network, so it can take a minute or more. The Demo page allows up to 300 seconds, Vercel's maximum.
- The test suites blank the Turso and Blob variables, so running tests can never touch the live database or photos.


## Accounts and sign-in

Everyone signs in with a username and a password they create **for Ramblin' Repairs**. It is not their Georgia Tech password, and every password field says so. Georgia Tech single sign-on (Microsoft Entra ID / GT CAS) comes later, once OIT approves an app registration; the login page shows a placeholder **Sign in with Georgia Tech SSO** button until then (`SSO_ENABLED` in `src/config/app.ts`).

There are four kinds of account:

| Role | Who | Lands on | Can |
|---|---|---|---|
| **Student** | Signs up at `/signup` | Home | Report issues; see public issues, their hall and room (once Housing confirms it), and their own reports; me too, follow, confirm, reopen. |
| **Contractor** | Created by an admin (invite email) | `/jobs` | See only the tickets assigned to them, start and finish work (with a work log), post public notes, set availability. |
| **Staff** | Created by an admin | `/staff` | Their department's queue: triage, assign to contractors, reassign, override, internal notes. Housing supervisors verify residences. |
| **Administrator** | Created by an admin | `/admin` | Everything, across departments: people, contractors, audit log, analytics, demo controls. Must use two-factor sign-in. |

The login page has three tabs (Student, Contractor, Staff & Administrator, also at `/login/contractor` and `/login/staff`). The tab only changes the labels: where you land always comes from the role on your account.

**Seeded accounts.** Every seeded person's password is `buzz-fixes-everything` (or your `SEED_DEMO_PASSWORD`).

| Person | Username | Role |
|---|---|---|
| Maya Patel | `mpatel3` | Student, Glenn 214 |
| Ethan Brooks | `ebrooks7` | Student, Glenn 309 |
| Alex Kim | `akim88` | Student, off campus |
| Terrence Wallace | `twallace` | Contractor, Housing (Peachtree Mechanical) |
| Marcus Bell | `mbell` | Contractor, Facilities (license expires in 12 days) |
| Kevin Tran | `ktran` | Contractor, IT |
| Victor Ramos | `vramos` | Contractor waiting on a background check (can't sign in) |
| Linda Okafor | `lokafor3` | Staff, Housing supervisor (verifies residences) |
| Rosa Delgado | `rdelgado7` | Staff, Facilities supervisor (manages contractors) |
| Aisha Rahman | `arahman5` | Staff, IT supervisor |
| Elena Vasquez | `evasquez1` | Administrator (two-factor sign-in) |

All 14 students, 7 contractors, 6 supervisors and the admin are in `src/lib/seed/data.ts`.

**Signing in as the admin.** Elena's account has two-factor sign-in with a demo authenticator key. After her password, run `npm run demo:totp` for the current 6-digit code, or add the printed `otpauth://` key to any authenticator app.

**Email.** Without `RESEND_API_KEY`, sign-up confirmation, password-reset and invite links appear in the `npm run dev` terminal (and in `.mail/outbox.jsonl`). Open the link in your browser.

### How the demo works

With `DEMO_MODE=true`, an administrator gets **Demo controls** in the account menu:

- **View as** any student, contractor or staff member. It's real impersonation through a signed cookie, shown by a "Viewing as … — Stop" banner, and recorded in the audit log.
- **Fast-forward the clock** by 30 minutes up to 2 days, to watch tickets pass their response target and escalate. The header shows how far ahead the demo clock is.
- **Reset demo data.** You stay signed in.

## 3-minute demo script

Before you start: run `npm run db:reset` so ticket numbers and timers match. Sign in on the **Staff & Administrator** tab as `evasquez1` with `buzz-fixes-everything` and the code from `npm run demo:totp`. Then use **Demo → View as** to switch people quickly. (You can also sign out and sign in as each person; the usernames are above.)

**0:00 · A student reports a leak in her dorm room (45 s)**
1. **Demo → View as Maya Patel** (Glenn Residence Hall, Room 214). On Home, type `Water is leaking from under the bathroom sink and pooling on the floor.` into **What needs fixing?**, leave **My room** selected, and click **Continue**.
2. The report form opens with Glenn, Room 214, and the description filled in. It notes that only Maya, her roommate, and staff will see this report. Optionally add a photo.
3. Click **Check and route it**.

**0:20 · Instant classification and routing**
4. The review card shows **Goes to Housing Maintenance**, category **Plumbing & leaks**, severity **Urgent**, and first response within **4 hours**, plus why it was classified that way.
5. Optional: change the category to Wi-Fi and back. The department re-routes live (the rules are in `src/config/routing.ts`).
6. Click **Submit report**. Ticket **RR-1061** opens, owned by Maya and marked private to her room, with the repair tracker (Reported → Assigned → In progress → Fixed) and a live response countdown.

**0:45 · Staff dispatch it; the contractor does the work (40 s)**
7. **Stop** viewing as Maya, then **View as Linda Okafor** (Housing supervisor). Her queue opens, sorted by severity and time remaining, with RR-1061 near the top and an **Assign** picker that lists only eligible contractors.
8. Open it. In **Staff controls**, set **Assigned**, pick **Terrence Wallace**, add `On my way with a new trap.`, and **Save status**. The countdown becomes "Responded within target".
9. **View as Terrence Wallace** (contractor). **My jobs** lists RR-1061 (and only his jobs). Open it, **Start work**, then fill in what he did and **Finish and mark resolved**. The work log records the time in the room and the materials.
10. **View as Maya**. The bell shows the alerts: a contractor was assigned, work started, it's resolved. She clicks **Yes, it's fixed**.

**1:25 · A second student hits the duplicate check on a public issue (45 s)**
11. **View as Ethan Brooks** (Glenn, Room 309). Optional: paste Maya's ticket URL and you get "not found", because room issues are private to that room's residents.
12. **Report a problem** → Building **Price Gilbert Memorial Library** → **2nd floor quiet study** → `wifi keeps disconnecting on the 2nd floor quiet study` → **Check and route it**.
13. **Already reported?** shows RR-1032 (Wi-Fi dropping, 5 me too). Click **Me too**. The ticket now shows 7 people affected, and Ethan is following it.
14. Open **Map**: pins colored by severity with the category icon inside, "people affected" badges, and the heat layer. Tap a pin for **Me too / Follow**. Switch the view to **List** for the same issues without the map.

**2:10 · An overdue ticket escalates (50 s)**
15. **View as Aisha Rahman** (IT supervisor). In the IT queue, "Room 249 projector won't turn on before 2pm class" is Urgent with about **45 minutes** left and no response.
16. **Demo → +1 hour** (the Demo page works while viewing as someone). The confirmation reports the escalation.
17. Back in **Queue**: an **Escalated to you** banner, a red **Overdue** timer, and a new alert in the bell. The ticket's timeline reads "No response within the 4-hour target. Escalated to the IT supervisor (Aisha R.)." The student who reported it was notified too.
18. To close: **Stop** viewing → **Insights** as Elena: on-time first-response rate, average resolution time by department, issues by building, recurring problems, and **Contractor work** (jobs done, average time on the job, cost by department). **People** shows rooms waiting for Housing; **Contractors** flags Marcus Bell's license expiring; **Audit log** lists every impersonation.

Bonus beats if you have time: type `There is smoke coming out of the outlet` as a report to see the Emergency banner with the GT Police number and the severity locked at Emergency; sign up a new student at `/signup` and confirm them from the link in the terminal; or open **QR codes** as staff and click **Test this code** on a washer label.

## Features

| Feature | Where to look |
|---|---|
| Reporting with photo, AI triage, student corrections | `/report`, `src/app/report/ReportForm.tsx`, `src/lib/triage/` |
| Routing rules (category × location type → department) | `src/config/routing.ts` |
| Response targets, police number, me-too threshold, safety phrases | `src/config/app.ts` |
| Location: building, floor, room, equipment; printable QR codes | `/qr`, `src/lib/qr.ts` |
| Duplicate check with "Me too"; me-toos raise priority | `findDuplicates` and `addMeToo` in `src/lib/tickets.ts` |
| Ownership: student owns dorm-room tickets; departments own the rest; reporter auto-follows | `createTicket` in `src/lib/tickets.ts` |
| Timeline, in-app notifications on every change | `/tickets/[id]`, `/notifications`, `src/lib/notify.ts` |
| Comments with up to 3 photos from anyone who can see the ticket; commenting follows it, and watchers and the department are alerted | `addComment` in `src/lib/tickets.ts`, `src/app/tickets/[id]/CommentForm.tsx` |
| Response countdowns, overdue flag, escalation to supervisor, demo clock | `src/lib/sla.ts`, `runEscalationSweep`, `src/lib/clock.ts` |
| Safety: Emergency for gas, flooding, wiring, smoke, stuck elevators, and more | `src/lib/triage/safety.ts` |
| Campus map (Google Maps, or OpenStreetMap without a key) with severity pins, heat layer, filters, list view | `/map`, `src/app/map/` |
| Staff queue: sort, status changes, reassign, override, notes (public or internal) | `/staff`, `src/app/tickets/[id]/StaffPanel.tsx` |
| Administrator analytics, including contractor work from work logs | `/admin`, `src/lib/analytics.ts` |
| Accounts: sign-in (three tabs), sign-up, email verification, password reset, invites, two-factor sign-in, lockout | `/login`, `/signup`, `/account/security`, `src/lib/auth.ts`, `src/app/auth-actions.ts`, `src/lib/sign-in.ts` |
| Permissions: one `getViewer()`, `requireRole`, staff permission flags | `src/lib/session.ts`, `src/lib/visibility.ts`, `src/proxy.ts` |
| Contractors: jobs, work log, availability, credentials, eligibility for assignment | `/jobs`, `src/lib/eligibility.ts`, `contractor*` in `src/lib/tickets.ts` |
| People, residence verification, contractors, audit log | `/admin/users`, `/admin/contractors`, `/admin/audit`, `src/lib/accounts.ts` |

### Visibility rules

Visibility is enforced in the database queries. Every list, count, map point, duplicate match, and ticket lookup goes through `visibleTickets()` in `src/lib/visibility.ts`:

- A **dorm room** issue is visible only to that room's residents and staff.
- A **dorm shared-area** issue (hallway, bathroom, lounge, laundry) is visible only to that hall's residents and staff.
- Students who don't live in a hall see nothing from it: no tickets, pins, heat, counts, or duplicate matches. A hidden ticket's URL returns 404, exactly like a missing one.
- **Public building** issues are visible to every student, staff member and admin.
- Students always see **their own reports**.
- **Contractors** see only the tickets assigned to them, with the room details the job needs and the reporter's first name, nothing else about students.
- A student whose room **Housing hasn't confirmed yet** sees only public issues and their own reports, and can only report in public buildings. This stops anyone from claiming someone else's room to read its tickets.

Students can also only *file* reports in public buildings, their own hall's shared areas, and their own room, so nobody creates a ticket they can't see. Other students appear anonymously on timelines; staff names are shown. GT ID and gender are visible only to the student and administrators; pay rates and costs only to administrators (and the contractor's own work log). Photos are served only to people who can see their ticket.

Staff act only on their own department's tickets (administrators on all), and every server action derives the user from `getViewer()` and checks the role, never trusting ids from the browser.

## Testing

```bash
npm test             # unit + integration (Vitest): see below
npm run test:e2e     # browser tests (Playwright): scenarios × phone and desktop
npm run test:all     # typecheck, lint, Vitest, Playwright
```

The first Playwright run needs a browser: `npx playwright install chromium`.

- **Unit** (`tests/unit`): routing for every category × location type, safety-phrase detection (including false positives like a chirping smoke detector), keyword classification, triage orchestration with Claude mocked (success, failure fallback, safety override), response-target math, queue ordering, text similarity, and analytics.
- **Integration** (`tests/integration`), against a real seeded SQLite database (`prisma/test.db`): every visibility rule; cross-checks that the database filter and the in-memory check agree for every user and ticket; that no notification, follow, or me-too ever reached someone who can't see the ticket; and the full ticket lifecycle (creation, ownership, duplicates, me-too priority raise, staff actions, confirm/reopen, escalation).
- **Accounts** (`tests/unit/auth-schemas.test.ts`, `tests/unit/eligibility.test.ts`, `tests/integration/accounts.test.ts`): every sign-up rule, contractor eligibility, sign-up through Better Auth with every field saved and privileged fields ignored, email verification, lockout after 5 failures, disabled and ineligible accounts, admin two-factor, password reset, invites, the audit log, and photo permissions.
- **End to end** (`tests/e2e`), against a production build on its own database (`prisma/e2e.db`): sign-up → email link → sign-in → report → sign-out; contractor start/finish; staff dispatch; admin 2FA → new contractor → audit log; forgot/reset password; keyboard-only sign-in on each tab; the SSO placeholder; all five demo beats, visibility in the browser (404s, map, lists, QR codes for other halls), the emergency banner, and accessibility. axe-core checks every page as each role for WCAG 2.2 A/AA. There are also keyboard-only tests for the report flow and map pins, a skip-link test, and a 24 px minimum target-size check.

## Accessibility

- Text and controls meet WCAG AA contrast; status and severity are never color-only (labels, bar glyphs, icons).
- Typeface: Atkinson Hyperlegible Next, designed for low-vision readers.
- Visible focus ring on every control, skip link, landmarks, labeled forms, and live regions that announce triage results and action outcomes.
- After analysis, focus moves to the results. The map has an equivalent **List** view, and pins are keyboard-focusable with descriptive titles.
- Respects `prefers-reduced-motion`. Charts have a table view.
- Known exception: on phones, pins in the same building can overlap at default zoom. WCAG 2.5.8's "equivalent control" exception covers this through the List view, so the automated map check skips only that rule.

## Tech notes and decisions

- **Next.js 16** (App Router) with Tailwind 4. `cacheComponents` is off: every page depends on the signed-in user, so request-time rendering is the simpler, correct model.
- **Better Auth** with the Prisma adapter on the same SQLite database: email + password with required email verification, the username plugin, Have I Been Pwned (only the first five characters of the password's SHA-1 hash leave the server), TOTP two-factor, database sessions (7 days with "remember me", otherwise a browser-session cookie; staff and admins at most 12 hours), and database-backed rate limiting. Passwords are hashed with scrypt. Sign-in, sign-up and password changes run as server actions that validate with the shared Zod schemas in `src/lib/auth-schemas.ts`; the matching HTTP endpoints are disabled so nobody can skip that validation or the lockout.
- **Roles live on the existing User table** (`role` is `input: false`, as are department, supervisor, residence verification, disabled and last login), so no sign-up or profile update can grant access. `proxy.ts` only redirects when there's no session cookie; `getViewer()` is the real check on every page and action.
- **Prisma 6.19 + SQLite.** Prisma's `latest` npm tag pointed at a 8.0 release candidate during development, so the stable 6.x line is pinned. SQLite has no enums; allowed values live in `src/lib/domain.ts` and are validated before writes. Deployed, the same schema runs on Turso (hosted SQLite) through `@prisma/adapter-libsql`; `src/lib/prismaClient.ts` picks the database.
- **The seed replays history through the real services**, in time order, with the escalation sweep running hourly. Seeded data therefore obeys exactly the same rules as live data.
- **Department comes from the routing rules, not the model.** The AI suggests category and severity, and the config decides the department, so routing is auditable and editable in one file. Students correct the category (the department follows); staff can reassign departments directly.
- **The AI's original verdict is signed** between the analyze and submit steps, so the "what the AI said vs. what was filed" record can't be tampered with from the browser.
- Photos are downscaled in the browser, checked by magic bytes, stored in `uploads/` locally or a private Vercel Blob store when deployed (`src/lib/uploads.ts`), and served by a route handler that requires a session and the same visibility check as the ticket.
- **All 38 residence halls** are in the sample data (East Campus, West Campus, North Avenue, graduate housing), each with generated hallways, bathrooms (traditional halls), lounges, laundry rooms, washers, dryers, and elevators. Coordinates and addresses come from OpenStreetMap (Nominatim). The building picker groups them by area, with the student's own hall first.
- **Maps.** With `GOOGLE_MAPS_API_KEY` set, the map uses Google Maps with a quiet custom style; pins, popups, and the heat layer are drawn as our own DOM and canvas overlays, so no Map ID is needed and pins stay keyboard-focusable buttons. Without a key, or if Google rejects the key, it falls back to OpenStreetMap tiles through Leaflet.
