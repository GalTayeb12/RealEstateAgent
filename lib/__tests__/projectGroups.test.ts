import { describe, expect, it } from "vitest";
import { groupByProject, type RankedType } from "../projectGroups";

const t = (aomId: string, projectId: string | undefined, passes = true): RankedType =>
  ({ aomId, projectId, valid: true, passesHardFilters: passes });

describe("groupByProject", () => {
  // Buyer wants 4+ rooms: Yarkon 4 and Rainbow 4 fit, the 3-room types do not.
  const full = [t("yarkon-4", "yarkon"), t("yarkon-5", "yarkon"), t("rainbow-4", "rainbow")];
  const near = [t("florentin-3", "florentin", false), t("yarkon-3", "yarkon", false), t("rainbow-3", "rainbow", false)];
  const { groups, near: rest } = groupByProject(full, near);

  it("one card per project, in score order", () => {
    expect(groups.map((g) => g.key)).toEqual(["yarkon", "rainbow"]);
  });
  it("the best fitting type leads the card, other fitting types go under it", () => {
    expect(groups[0].best.aomId).toBe("yarkon-4");
    expect(groups[0].others.map((r) => r.aomId)).toEqual(["yarkon-5"]);
  });
  it("non-fitting types of a shown project are hidden in that card", () => {
    expect(groups[0].hidden.map((r) => r.aomId)).toEqual(["yarkon-3"]);
    expect(groups[1].hidden.map((r) => r.aomId)).toEqual(["rainbow-3"]);
  });
  it("projects with no fitting type stay in the near-match list", () => {
    expect(rest.map((r) => r.aomId)).toEqual(["florentin-3"]);
  });
  it("rows without a project id are not merged together", () => {
    const g = groupByProject([t("a", undefined), t("b", undefined)], []);
    expect(g.groups).toHaveLength(2);
  });
});
