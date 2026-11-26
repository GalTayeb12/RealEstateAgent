import { describe, expect, it } from "vitest";
import { studioCandidates } from "../studio/offerDesign";

describe("studioCandidates (which studio apartments a listing's tour leads to)", () => {
  it("prefers the explicit studio field, then the tour itself, then its -shell twin", () => {
    expect(studioCandidates({ slug: "yarkon", studio: "yarkon-twin-shell" })).toEqual(["yarkon-twin-shell", "yarkon", "yarkon-shell"]);
  });
  it("is the tour and its shell when nothing is configured", () => {
    expect(studioCandidates({ slug: "ut-demo-rotem" })).toEqual(["ut-demo-rotem", "ut-demo-rotem-shell"]);
  });
  it("never repeats a slug", () => {
    expect(studioCandidates({ slug: "a", studio: "a" })).toEqual(["a", "a-shell"]);
  });
});
