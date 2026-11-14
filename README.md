# FixIt GT

One place for Georgia Tech students to report, track, and see campus maintenance issues.

Today a student has to know whether a broken thing belongs to Housing, Facilities, or IT, gets little visibility into what happens next, and waits days for someone to classify and route the request. FixIt GT classifies and routes each report in seconds (Claude, with a keyword fallback), shows live status with response-time countdowns, and puts open issues on a campus map so people add a "me too" instead of filing duplicates.

This is a campus solution challenge demo with realistic sample data. It does not connect to Georgia Tech's real systems.

## Quick start

Requirements: Node.js 20 or newer (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env
npm run setup        # generates the Prisma client, creates prisma/dev.db, seeds sample data
npm run dev          # http://localhost:3000
```

npm 11 blocks dependency install scripts by default. `package.json` already approves the four that are needed (Prisma's engines and esbuild). If your npm asks anyway, run `npm install-scripts approve @prisma/client @prisma/engines prisma esbuild`.

To start over with fresh sample data at any time, run `npm run db:reset`, or use **Reset demo data** on the in-app Demo page.

### Claude triage (optional)

Set these in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5-5   # any Claude model id
```

Without a key, FixIt GT classifies reports with its keyword rules (`src/lib/triage/keywords.ts`), so everything works end to end. If the API call fails or times out (25 s), the app falls back to the keyword rules and says so on the review screen. With a key, the report text and photo go to Claude using structured output at low effort, with the API's server-side refusal fallback enabled (`fallbacks: "default"`).

## How the demo works

There's no real login. The person chip in the header opens **Demo**, where you can:

- **View as** any seeded person: 8 students in five residence halls (one off campus), a technician and a supervisor for each of the six departments, and an administrator.
- **Fast-forward the clock** by 30 minutes up to 2 days, to watch tickets pass their response target and escalate. The header shows how far ahead the demo clock is.
- **Reset demo data.**

## 3-minute demo script

Before you start: run `npm run db:reset` (or **Demo → Reset demo data**) so ticket numbers and timers match. The app opens as **Maya Patel**, who lives in Glenn Residence Hall, Room 214.

**0:00 · A student reports a leak in her dorm room (45 s)**
1. On Home, click **Report an issue**, then **My room**. The form notes that only Maya, her roommate, and staff will see this report.
2. Describe it: `Water is leaking from under the bathroom sink and pooling on the floor.` Optionally add a photo.
3. Click **Check and route it**.

**0:20 · Instant classification and routing**
4. The review card shows **Goes to Housing Maintenance**, category **Plumbing & leaks**, severity **Urgent**, and first response within **4 hours**, plus why it was classified that way.
5. Optional: change the category to Wi-Fi and back. The department re-routes live (the rules are in `src/config/routing.ts`).
6. Click **Submit report**. Ticket **FX-1048** opens, owned by Maya and marked private to her room, showing the timeline (Submitted → Triaged) and a live countdown.

**0:45 · Staff update it (40 s)**
7. Header chip → **Terrence Wallace** (Housing technician). His queue opens, sorted by severity and time remaining, with FX-1048 near the top.
8. Open it. In **Staff controls**, set **Assigned** and add the message `On my way with a new trap.`, then **Save status**. The timeline updates and the countdown becomes "Responded within target". Set **In progress** next.
9. Switch back to **Maya**. The bell shows new alerts, one per change.

**1:25 · A second student hits the duplicate check on a public issue (45 s)**
10. Switch to **Ethan Brooks** (Glenn, Room 309). Optional: paste Maya's ticket URL and you get "not found", because room issues are private to that room's residents.
11. **Report an issue** → Building **Price Gilbert Memorial Library** → **2nd floor quiet study** → `wifi keeps disconnecting on the 2nd floor quiet study` → **Check and route it**.
12. **Already reported?** shows FX-1029 (Wi-Fi dropping, 5 me too). Click **Me too**. The ticket now shows 7 people affected, and Ethan is following it.
13. Open **Map**: status-colored pins, me-too badges, and the heat layer. Tap a pin for **Me too / Follow**. Switch the view to **List** for the same issues without the map.

**2:10 · An overdue ticket escalates (50 s)**
14. Switch to **Aisha Rahman** (IT supervisor). In the IT queue, "Room 249 projector won't turn on before 2pm class" is Urgent with about **45 minutes** left and no response.
15. **Demo → +1 hour**. The confirmation reports the escalation.
16. Back in **Queue**: an **Escalated to you** banner, a red **Overdue** timer, and a new alert in the bell. The ticket's timeline reads "No response within the 4-hour target. Escalated to the IT supervisor (Aisha R.)." The student who reported it was notified too.
17. To close: switch to **Elena Vasquez** (administrator) → **Insights**: on-time first-response rate, average resolution time by department, issues by building, and recurring problems (Washer 3, Treadmill 12, the Room 1443 projector).

Bonus beats if you have time: type `There is smoke coming out of the outlet` as a report to see the Emergency banner with the GT Police number and the severity locked at Emergency, or open **QR codes** as staff and click **Test this code** on a washer label.

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
| Response countdowns, overdue flag, escalation to supervisor, demo clock | `src/lib/sla.ts`, `runEscalationSweep`, `src/lib/clock.ts` |
| Safety: Emergency for gas, flooding, wiring, smoke, stuck elevators, and more | `src/lib/triage/safety.ts` |
| Campus map with status pins, heat layer, filters, list view | `/map` |
| Staff queue: sort, status changes, reassign, override, notes (public or internal) | `/staff`, `src/app/tickets/[id]/StaffPanel.tsx` |
| Administrator analytics | `/admin`, `src/lib/analytics.ts` |

### Visibility rules

Visibility is enforced in the database queries. Every list, count, map point, duplicate match, and ticket lookup goes through `visibleTickets()` in `src/lib/visibility.ts`:

- A **dorm room** issue is visible only to that room's residents and staff.
- A **dorm shared-area** issue (hallway, bathroom, lounge, laundry) is visible only to that hall's residents and staff.
- Students who don't live in a hall see nothing from it: no tickets, pins, heat, counts, or duplicate matches. A hidden ticket's URL returns 404, exactly like a missing one.
- **Public building** issues are visible to everyone.

Students can also only *file* reports in public buildings, their own hall's shared areas, and their own room, so nobody creates a ticket they can't see. Other students appear anonymously on timelines; staff names are shown.

## Testing

```bash
npm test             # unit + integration (Vitest): 171 tests, ~25 s
npm run test:e2e     # browser tests (Playwright): 30 scenarios × phone and desktop
npm run test:all     # typecheck, lint, Vitest, Playwright
```

The first Playwright run needs a browser: `npx playwright install chromium`.

- **Unit** (`tests/unit`): routing for every category × location type, safety-phrase detection (including false positives like a chirping smoke detector), keyword classification, triage orchestration with Claude mocked (success, failure fallback, safety override), response-target math, queue ordering, text similarity, and analytics.
- **Integration** (`tests/integration`), against a real seeded SQLite database (`prisma/test.db`): every visibility rule; cross-checks that the database filter and the in-memory check agree for every user and ticket; that no notification, follow, or me-too ever reached someone who can't see the ticket; and the full ticket lifecycle (creation, ownership, duplicates, me-too priority raise, staff actions, confirm/reopen, escalation).
- **End to end** (`tests/e2e`), against a production build on its own database (`prisma/e2e.db`): all five demo beats, visibility in the browser (404s, map, lists, QR codes for other halls), the emergency banner, and accessibility. axe-core checks every page as each role for WCAG 2.2 A/AA. There are also keyboard-only tests for the report flow and map pins, a skip-link test, and a 24 px minimum target-size check.

## Accessibility

- Text and controls meet WCAG AA contrast; status and severity are never color-only (labels, bar glyphs, icons).
- Typeface: Atkinson Hyperlegible Next, designed for low-vision readers.
- Visible focus ring on every control, skip link, landmarks, labeled forms, and live regions that announce triage results and action outcomes.
- After analysis, focus moves to the results. The map has an equivalent **List** view, and pins are keyboard-focusable with descriptive titles.
- Respects `prefers-reduced-motion`. Charts have a table view.
- Known exception: on phones, pins in the same building can overlap at default zoom. WCAG 2.5.8's "equivalent control" exception covers this through the List view, so the automated map check skips only that rule.

## Tech notes and decisions

- **Next.js 16** (App Router) with Tailwind 4. `cacheComponents` is off: every page depends on the "view as" cookie, so request-time rendering is the simpler, correct model.
- **Prisma 6.19 + SQLite.** Prisma's `latest` npm tag pointed at a 8.0 release candidate during development, so the stable 6.x line is pinned. SQLite has no enums; allowed values live in `src/lib/domain.ts` and are validated before writes.
- **The seed replays history through the real services**, in time order, with the escalation sweep running hourly. Seeded data therefore obeys exactly the same rules as live data.
- **Department comes from the routing rules, not the model.** The AI suggests category and severity, and the config decides the department, so routing is auditable and editable in one file. Students correct the category (the department follows); staff can reassign departments directly.
- **The AI's original verdict is signed** between the analyze and submit steps, so the "what the AI said vs. what was filed" record can't be tampered with from the browser.
- Photos are downscaled in the browser, checked by magic bytes, stored in `uploads/`, and served by a route handler. Their URLs are unguessable UUIDs but aren't permission-checked. Fine for a demo; a real deployment would put them behind the same visibility check.
- Building coordinates come from OpenStreetMap (Nominatim). Map tiles come from OpenStreetMap with no API key.
