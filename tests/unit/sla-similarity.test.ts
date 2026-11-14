import { describe, expect, it } from "vitest";
import {
  awaitingFirstResponse,
  compareQueue,
  formatDuration,
  isOverdue,
  metResponseTarget,
  msRemaining,
  raisedSeverity,
  responseDueAt,
} from "@/lib/sla";
import { textSimilarity, tokenize } from "@/lib/similarity";

const H = 3_600_000;
const t0 = new Date("2026-11-13T12:00:00Z");

describe("response targets", () => {
  it("uses the configured hours per severity", () => {
    expect(responseDueAt(t0, "EMERGENCY").getTime() - t0.getTime()).toBe(1 * H);
    expect(responseDueAt(t0, "URGENT").getTime() - t0.getTime()).toBe(4 * H);
    expect(responseDueAt(t0, "STANDARD").getTime() - t0.getTime()).toBe(48 * H);
    expect(responseDueAt(t0, "LOW").getTime() - t0.getTime()).toBe(120 * H);
  });

  const waiting = { status: "TRIAGED", responseDueAt: new Date(t0.getTime() + 4 * H), firstResponseAt: null, createdAt: t0 };

  it("counts down until the first response", () => {
    expect(msRemaining(waiting, new Date(t0.getTime() + H))).toBe(3 * H);
    expect(isOverdue(waiting, new Date(t0.getTime() + 3.9 * H))).toBe(false);
  });

  it("goes negative and flags overdue after the target", () => {
    const later = new Date(t0.getTime() + 5 * H);
    expect(msRemaining(waiting, later)).toBe(-1 * H);
    expect(isOverdue(waiting, later)).toBe(true);
    expect(metResponseTarget(waiting, later)).toBe(false);
  });

  it("stops the clock once staff respond or the ticket closes", () => {
    const responded = { ...waiting, firstResponseAt: new Date(t0.getTime() + H) };
    expect(awaitingFirstResponse(responded)).toBe(false);
    expect(msRemaining(responded, new Date(t0.getTime() + 10 * H))).toBeNull();
    expect(isOverdue(responded, new Date(t0.getTime() + 10 * H))).toBe(false);
    expect(metResponseTarget(responded, t0)).toBe(true);

    const resolved = { ...waiting, status: "RESOLVED" };
    expect(isOverdue(resolved, new Date(t0.getTime() + 10 * H))).toBe(false);
  });

  it("reports a late response as a missed target", () => {
    expect(metResponseTarget({ ...waiting, firstResponseAt: new Date(t0.getTime() + 6 * H) }, t0)).toBe(false);
    expect(metResponseTarget(waiting, t0)).toBeNull();
  });

  it("raises severity one level, never past Urgent", () => {
    expect(raisedSeverity("LOW")).toBe("STANDARD");
    expect(raisedSeverity("STANDARD")).toBe("URGENT");
    expect(raisedSeverity("URGENT")).toBe("URGENT");
    expect(raisedSeverity("EMERGENCY")).toBe("EMERGENCY");
  });

  it("formats durations compactly", () => {
    expect(formatDuration(45 * 60_000)).toBe("45m");
    expect(formatDuration(3 * H + 12 * 60_000)).toBe("3h 12m");
    expect(formatDuration(-2 * H)).toBe("2h");
    expect(formatDuration(52 * H)).toBe("2d 4h");
    expect(formatDuration(48 * H)).toBe("2d");
    expect(formatDuration(20_000)).toBe("1m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("queue order", () => {
  const base = { status: "TRIAGED", firstResponseAt: null, meTooCount: 0, createdAt: t0 };
  const mk = (id: string, severity: string, dueInH: number, meTooCount = 0) => ({
    id,
    ...base,
    severity,
    meTooCount,
    responseDueAt: new Date(t0.getTime() + dueInH * H),
  });

  it("sorts by severity, then time remaining (overdue first), then me-too count", () => {
    const list = [
      mk("low", "LOW", 100),
      mk("std-later", "STANDARD", 40),
      mk("std-overdue", "STANDARD", -5),
      mk("urgent", "URGENT", 3),
      mk("emergency", "EMERGENCY", 0.5),
      mk("std-later-popular", "STANDARD", 40, 4),
    ];
    const sorted = [...list].sort((a, b) => compareQueue(a, b, t0)).map((t) => t.id);
    expect(sorted).toEqual(["emergency", "urgent", "std-overdue", "std-later-popular", "std-later", "low"]);
  });
});

describe("text similarity", () => {
  it("folds synonyms and stems", () => {
    expect(tokenize("Wi-Fi keeps dropping")).toEqual(new Set(["wifi", "drop"]));
    expect(tokenize("Internet disconnects")).toEqual(new Set(["wifi", "drop"]));
    expect(tokenize("The sink is leaking!")).toEqual(new Set(["sink", "leak"]));
  });

  it("scores near-duplicates high and unrelated reports low", () => {
    const a = "Wi-Fi keeps dropping in the 2nd floor quiet study area";
    expect(textSimilarity(a, "wifi disconnecting on 2nd floor quiet study")).toBeGreaterThan(0.4);
    expect(textSimilarity(a, "Projector in 1443 has a purple tint")).toBe(0);
    expect(textSimilarity("", a)).toBe(0);
  });
});
