import { describe, expect, it } from "vitest";
import {
  avgResolutionHours,
  formatHours,
  headline,
  issuesByBuilding,
  recurringProblems,
  responseTargetShare,
  type AnalyticsTicket,
} from "@/lib/analytics";

const H = 3_600_000;
const now = new Date("2026-11-13T12:00:00Z");
let n = 0;
function t(over: Partial<AnalyticsTicket> = {}): AnalyticsTicket {
  n++;
  const createdAt = over.createdAt ?? new Date(now.getTime() - 10 * H);
  return {
    id: `t${n}`,
    number: 1000 + n,
    summary: "s",
    category: "PLUMBING",
    department: "HOUSING",
    status: "TRIAGED",
    buildingId: "b1",
    buildingName: "Glenn",
    spaceId: null,
    spaceLabel: null,
    assetId: null,
    assetName: null,
    createdAt,
    responseDueAt: new Date(createdAt.getTime() + 4 * H),
    firstResponseAt: null,
    resolvedAt: null,
    escalatedAt: null,
    meTooCount: 0,
    ...over,
  };
}

describe("issuesByBuilding", () => {
  it("counts total and open per building, busiest first", () => {
    const rows = issuesByBuilding([t(), t({ status: "RESOLVED" }), t({ buildingId: "b2", buildingName: "Library" })]);
    expect(rows).toEqual([
      { buildingId: "b1", name: "Glenn", total: 2, open: 1 },
      { buildingId: "b2", name: "Library", total: 1, open: 1 },
    ]);
  });
});

describe("recurringProblems", () => {
  it("groups by equipment first, then by room and category", () => {
    const washer = { assetId: "w3", assetName: "Washer 3", spaceId: "laundry", spaceLabel: "Laundry", category: "APPLIANCE" };
    const list = [
      t({ ...washer, status: "CONFIRMED" }),
      t({ ...washer, status: "CONFIRMED", category: "PLUMBING" }), // different category, same machine: still the same problem spot
      t({ ...washer }),
      t({ spaceId: "r1", spaceLabel: "Room 1", category: "HVAC" }),
      t({ spaceId: "r1", spaceLabel: "Room 1", category: "HVAC" }),
    ];
    const rec = recurringProblems(list, now);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ key: "asset:w3", label: "Washer 3", where: "Glenn · Laundry", count: 3, openNow: 1 });
  });

  it("ignores reports outside the window", () => {
    const old = new Date(now.getTime() - 100 * 24 * H);
    const list = [t({ assetId: "a", assetName: "A", createdAt: old }), t({ assetId: "a", assetName: "A" }), t({ assetId: "a", assetName: "A" })];
    expect(recurringProblems(list, now)).toEqual([]);
    expect(recurringProblems(list, now, 120)).toHaveLength(1);
  });
});

describe("avgResolutionHours", () => {
  it("averages report-to-resolved time per department, null when nothing resolved", () => {
    const c = new Date(now.getTime() - 100 * H);
    const rows = avgResolutionHours([
      t({ createdAt: c, resolvedAt: new Date(c.getTime() + 10 * H) }),
      t({ createdAt: c, resolvedAt: new Date(c.getTime() + 30 * H) }),
      t({ department: "IT" }),
    ]);
    expect(rows.find((r) => r.department === "HOUSING")).toEqual({ department: "HOUSING", resolved: 2, avgHours: 20 });
    expect(rows.find((r) => r.department === "IT")!.avgHours).toBeNull();
    expect(rows).toHaveLength(6);
  });
});

describe("responseTargetShare", () => {
  it("counts met, missed, and excludes tickets still inside their window", () => {
    const c = new Date(now.getTime() - 10 * H);
    const list = [
      t({ createdAt: c, firstResponseAt: new Date(c.getTime() + 1 * H) }), // met
      t({ createdAt: c, firstResponseAt: new Date(c.getTime() + 6 * H) }), // missed (late)
      t({ createdAt: c }), // missed (overdue, no response)
      t({ createdAt: new Date(now.getTime() - 1 * H) }), // pending: excluded
      t({ department: "IT", createdAt: c, firstResponseAt: new Date(c.getTime() + 2 * H) }),
    ];
    const r = responseTargetShare(list, now);
    expect(r.overall).toEqual({ met: 2, missed: 2, total: 4, share: 0.5 });
    expect(r.byDepartment.find((d) => d.department === "HOUSING")).toMatchObject({ met: 1, missed: 2, share: 1 / 3 });
    expect(r.byDepartment.find((d) => d.department === "DINING")!.share).toBeNull();
  });
});

describe("headline", () => {
  it("summarizes the campus", () => {
    const c = new Date(now.getTime() - 10 * H);
    const h = headline(
      [t({ createdAt: c, meTooCount: 2 }), t({ createdAt: c, firstResponseAt: new Date(c.getTime() + 2 * H), status: "RESOLVED", escalatedAt: c })],
      now,
    );
    expect(h).toEqual({ total: 2, open: 1, overdue: 1, escalated: 1, medianFirstResponseHours: 2, meToos: 2 });
  });

  it("formats hours for people", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0.5)).toBe("30 min");
    expect(formatHours(3.25)).toBe("3.3 hr");
    expect(formatHours(30)).toBe("30 hr");
    expect(formatHours(72)).toBe("3.0 days");
  });
});
