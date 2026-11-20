import { describe, expect, it } from "vitest";
import { citiesIn, locationMatches } from "../location";

describe("citiesIn", () => {
  it.each([
    ["Sde Dov, North Tel Aviv", ["תל אביב"]],
    ["תל-אביב-יפו", ["תל אביב"]],
    ["ת\"א", ["תל אביב"]],
    ["רחוב הירקון 120, תל אביב", ["תל אביב"]],
    ["Ramat Gan", ["רמת גן"]],
    ["פתח תקוה", ["פתח תקווה"]],
    ["Florentin", []],
  ])("%s → %j", (text, expected) => {
    expect([...citiesIn(text)]).toEqual(expected);
  });
});

describe("locationMatches", () => {
  it("Hebrew buyer matches an English listing in the same city (Rainbow case)", () => {
    expect(locationMatches("תל אביב", "Sde Dov, North Tel Aviv")).toBe(true);
  });
  it("different known cities do not match", () => {
    expect(locationMatches("תל אביב", "Ramat Gan")).toBe(false);
    expect(locationMatches("Haifa", "רחוב הירקון 120, תל אביב")).toBe(false);
  });
  it("one of several buyer cities is enough", () => {
    expect(locationMatches("תל אביב או רמת גן", "Ramat Gan")).toBe(true);
  });
  it("falls back to word overlap when no known city is named", () => {
    expect(locationMatches("פלורנטין", "פלורנטין, דרום העיר")).toBe(true);
    expect(locationMatches("Florentin", "Neve Tzedek")).toBe(false);
  });
});
