import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { ID, TEXT, check, schemas } from "@/lib/action-schemas";

describe("action input checks", () => {
  it("accepts ordinary values and rejects oversized or wrong-typed ones with a generic error", () => {
    expect(check(ID, "clx123abc")).toBe("clx123abc");
    expect(() => check(ID, "x".repeat(65))).toThrow(AppError);
    expect(() => check(ID, { $ne: "" })).toThrow("Check the form and try again.");
    expect(() => check(TEXT, "x".repeat(2001))).toThrow(AppError);
    expect(check(TEXT, "x".repeat(2000))).toHaveLength(2000);
    expect(() => check(schemas.override, { summary: "x".repeat(121) })).toThrow(AppError);
    expect(check(schemas.override, { summary: null, reason: null })).toEqual({ summary: null, reason: null });
    expect(() => check(schemas.residence, { userId: "u1", decision: "delete" })).toThrow(AppError);
  });
});
