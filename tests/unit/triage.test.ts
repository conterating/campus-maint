import { describe, expect, it, vi } from "vitest";
import { detectSafetyHazards } from "@/lib/triage/safety";
import { classifyByKeywords, summarize } from "@/lib/triage/keywords";
import { triage, type TriageDeps } from "@/lib/triage";

describe("detectSafetyHazards", () => {
  it.each([
    ["I smell gas in the kitchen", "Possible gas leak"],
    ["There's a gas leak near the stove", "Possible gas leak"],
    ["Strong smell of gas by the trash chute", "Possible gas leak"],
    ["The bathroom is flooding", "Flooding"],
    ["Burst pipe, water everywhere", "Flooding"],
    ["Exposed wiring hanging from the ceiling", "Exposed or sparking wiring"],
    ["The outlet sparks when I plug things in", "Exposed or sparking wiring"],
    ["There's smoke coming from the vent", "Smoke or fire"],
    ["Burning smell from the dryer", "Smoke or fire"],
    ["Someone is stuck in the elevator", "Elevator entrapment"],
    ["The elevator is stuck between floors with people inside", "Elevator entrapment"],
    ["I'm trapped in the elevator on floor 3", "Elevator entrapment"],
    ["Sewage backing up in the shower", "Sewage"],
    ["Our carbon monoxide detector keeps going off", "Carbon monoxide"],
    ["I got shocked touching the light switch", "Electrical shock"],
  ])("flags %j", (text, label) => {
    expect(detectSafetyHazards(text)).toContain(label);
  });

  it.each([
    "The smoke detector is chirping, needs a new battery",
    "Smoke alarm keeps beeping — battery",
    "Faucet is dripping slowly",
    "The elevator is slow but works",
    "Gaskets on the fridge door are worn",
    "Fire extinguisher cabinet glass is cracked",
    "Wi-Fi keeps dropping in the library",
    "The projector won't turn on",
  ])("does not flag %j", (text) => {
    expect(detectSafetyHazards(text)).toEqual([]);
  });

  it("still flags a real fire when a smoke detector is also mentioned", () => {
    expect(detectSafetyHazards("Smoke detector going off and there's a burning smell")).toContain("Smoke or fire");
  });
});

describe("classifyByKeywords", () => {
  it.each([
    ["Water is leaking from under the sink in my room", "PLUMBING"],
    ["The toilet won't stop running", "PLUMBING"],
    ["Wi-Fi keeps dropping on the 2nd floor", "NETWORK"],
    ["Eduroam won't connect", "NETWORK"],
    ["The projector shows a purple tint", "AV_TECH"],
    ["HDMI on the podium doesn't work", "AV_TECH"],
    ["The AC is blowing warm air", "HVAC"],
    ["No heat in my room, it's freezing", "HVAC"],
    ["Washer 3 won't drain", "APPLIANCE"],
    ["The elevator makes a grinding noise", "ELEVATOR"],
    ["My desk chair is broken", "FURNITURE"],
    ["Door won't lock", "DOORS_LOCKS"],
    ["There are roaches in the kitchen", "CLEANING"],
    ["The treadmill belt slips", "FITNESS"],
    ["Dish return conveyor stopped", "FOOD_SERVICE"],
    ["Big crack in the ceiling plaster", "STRUCTURAL"],
    ["The lights in the hallway flicker", "ELECTRICAL"],
    ["Something weird is going on", "OTHER"],
  ])("%j → %s", (text, category) => {
    expect(classifyByKeywords(text).category).toBe(category);
  });

  it("uses the equipment from a QR code as a strong hint", () => {
    expect(classifyByKeywords("It's broken again", { assetType: "PROJECTOR" }).category).toBe("AV_TECH");
    expect(classifyByKeywords("Makes a loud noise", { assetType: "WASHER" }).category).toBe("APPLIANCE");
    expect(classifyByKeywords("Belt slipping", { assetType: "TREADMILL" }).category).toBe("FITNESS");
  });

  it.each([
    ["No hot water in the shower", "URGENT"],
    ["My door won't lock", "URGENT"],
    ["Water leaking through the ceiling", "URGENT"],
    ["Small drip under the sink", "STANDARD"],
    ["Water is leaking from under the sink and pooling on the floor", "URGENT"],
    ["The faucet is dripping and won't stop", "URGENT"],
    ["Active leak under the sink", "URGENT"],
    ["Projector broken and we have an exam tomorrow", "URGENT"],
    ["There's a small scuff on the wall", "LOW"],
    ["Chair is a bit wobbly, not urgent", "LOW"],
    ["The washer won't start", "STANDARD"],
  ])("%j → %s", (text, severity) => {
    expect(classifyByKeywords(text).severity).toBe(severity);
  });

  it("explains its decision", () => {
    expect(classifyByKeywords("The sink is leaking").rationale).toMatch(/Matched keywords: .*leak/);
    expect(classifyByKeywords("hmm").rationale).toMatch(/No strong keywords/);
  });
});

describe("summarize", () => {
  it("uses the first sentence, tidied", () => {
    expect(summarize("hi! the sink is leaking. it started yesterday.", "PLUMBING")).toBe("The sink is leaking");
  });
  it("truncates long text on a word boundary", () => {
    const s = summarize("a ".repeat(10) + "really long description that keeps going and going well past the eighty character limit we set", "OTHER");
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("…")).toBe(true);
  });
  it("falls back to the category label for empty text", () => {
    expect(summarize("   ", "PLUMBING")).toBe("Plumbing & leaks");
  });
});

describe("triage", () => {
  const dorm = { buildingKind: "RESIDENCE", spaceScope: "DORM_ROOM", locationLabel: "Glenn · Room 214" };
  const library = { buildingKind: "LIBRARY", spaceScope: "PUBLIC", locationLabel: "Library · 2nd floor" };
  const noAi: TriageDeps = { configured: () => false, claude: vi.fn() };

  it("routes a dorm-room leak to Housing with the keyword classifier", async () => {
    const r = await triage({ description: "Water leaking from under my sink", ...dorm }, noAi);
    expect(r).toMatchObject({ category: "PLUMBING", department: "HOUSING", source: "keywords", hazards: [] });
    expect(noAi.claude).not.toHaveBeenCalled();
  });

  it("uses Claude when configured, then routes with the config file", async () => {
    const claude = vi.fn().mockResolvedValue({
      category: "NETWORK",
      severity: "URGENT",
      summary: "Wi-Fi drops every few minutes on the 2nd floor",
      rationale: "Connectivity issue affecting a study area.",
      safety_concern: false,
    });
    const r = await triage({ description: "internet bad", ...library }, { configured: () => true, claude });
    expect(claude).toHaveBeenCalledWith(expect.objectContaining({ locationType: "LIBRARY", description: "internet bad" }));
    expect(r).toMatchObject({ category: "NETWORK", severity: "URGENT", department: "IT", source: "claude" });
    expect(r.routeRule).toContain("NETWORK");
  });

  it("falls back to keywords when Claude fails", async () => {
    const claude = vi.fn().mockRejectedValue(new Error("timeout"));
    const r = await triage({ description: "The projector won't turn on", ...library }, { configured: () => true, claude });
    expect(r).toMatchObject({ source: "keywords", category: "AV_TECH", fallbackReason: "timeout" });
  });

  it("forces Emergency for safety phrases even if Claude disagrees", async () => {
    const claude = vi.fn().mockResolvedValue({ category: "PLUMBING", severity: "LOW", summary: "s", rationale: "r", safety_concern: false });
    const r = await triage({ description: "The bathroom is flooding", ...dorm }, { configured: () => true, claude });
    expect(r.severity).toBe("EMERGENCY");
    expect(r.hazards).toEqual(["Flooding"]);
    expect(r.rationale).toMatch(/^Safety: Flooding/);
  });

  it("forces Emergency for safety phrases without AI", async () => {
    const r = await triage({ description: "Someone is stuck in the elevator", ...library }, noAi);
    expect(r).toMatchObject({ severity: "EMERGENCY", category: "ELEVATOR", department: "FACILITIES" });
  });

  it("accepts an AI-detected hazard (e.g. from the photo) as an emergency", async () => {
    const claude = vi.fn().mockResolvedValue({ category: "ELECTRICAL", severity: "EMERGENCY", summary: "s", rationale: "r", safety_concern: true });
    const r = await triage({ description: "the outlet looks weird", ...dorm }, { configured: () => true, claude });
    expect(r.severity).toBe("EMERGENCY");
    expect(r.hazards).toEqual(["Safety concern spotted by AI"]);
  });

  it("caps a non-safety AI 'Emergency' at Urgent", async () => {
    const claude = vi.fn().mockResolvedValue({ category: "AV_TECH", severity: "EMERGENCY", summary: "s", rationale: "r", safety_concern: false });
    const r = await triage({ description: "projector dead before my final presentation", ...library }, { configured: () => true, claude });
    expect(r.severity).toBe("URGENT");
    expect(r.hazards).toEqual([]);
  });
});
