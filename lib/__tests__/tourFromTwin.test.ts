import { describe, expect, it } from "vitest";
import { modelFromTwin } from "../tour/fromTwin";
import { TLV3_TWIN } from "../twin/fixtures/tlv3";

describe("modelFromTwin", () => {
  const m = modelFromTwin(TLV3_TWIN);

  it("has one room per twin room, ids matching the walk", () => {
    expect(m.rooms.map((r) => r.id)).toEqual(TLV3_TWIN.rooms.map((r) => r.id));
  });

  it("gives Dana a line for every room and an intro", () => {
    const bot = m.profiles[0].bot;
    expect(bot.intro).toContain("דנה");
    for (const r of TLV3_TWIN.rooms) expect(bot[r.id]).toContain(r.name.he);
  });

  it("only states facts it knows (no invented storage or parking)", () => {
    expect(m.facts.storageSqm).toBe(0);
    expect(m.facts.parking).toBe(0);
    expect(m.facts.areaSqm).toBeGreaterThan(30);
    expect(m.questions.find((q) => q.k === "price")?.a).toContain("{price}");
  });

  it("uses the profile id the walk starts with", () => {
    expect(m.profiles.map((p) => p.id)).toEqual(["neutral"]);
  });
});
