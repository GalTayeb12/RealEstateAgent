import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { experienceFromBuild } from "../experience/fromBuild";
import { ProjectExperience } from "../experience/types";
import { isRedundantPreview, buildJobKey, buildSlug, queueBuild, readBuildJob, toBuildView, writeBuildJob, type BuildJob } from "../twin/buildJobs";
import { TLV3_TWIN } from "../twin/fixtures/tlv3";
import { planSvgFrame } from "../twin/svg";
import type { Storage } from "../storage";

// tlv3 was built by the Blender generator from this twin; its walk.json is real output.
const walk = JSON.parse(readFileSync(path.join(process.cwd(), "public/walk/tlv3/walk.json"), "utf8"));

describe("experienceFromBuild (tlv3)", () => {
  const exp = experienceFromBuild({
    slug: "ut-tlv3",
    base: "/walk/tlv3",
    walk,
    twin: TLV3_TWIN,
    title: { he: "דירת 3 חדרים", en: "3-room apartment" },
    aliases: ["unit-type-1"],
    planImage: "/walk/tlv3/plan.svg",
  });

  it("is a valid experience config", () => {
    expect(ProjectExperience.safeParse(exp).success).toBe(true);
    expect(exp.walk.base).toBe("/walk/tlv3");
    expect(exp.aliases).toEqual(["unit-type-1"]);
  });

  it("has one entry per walk room, named from the twin", () => {
    expect(Object.keys(exp.walk.rooms).sort()).toEqual(Object.keys(walk.rooms).sort());
    for (const r of TLV3_TWIN.rooms) {
      if (exp.walk.rooms[r.id]) expect(exp.walk.rooms[r.id].name).toEqual(r.name);
    }
  });

  it("puts every stand point inside its room", () => {
    for (const [id, room] of Object.entries(exp.walk.rooms)) {
      const [x1, y1, x2, y2] = walk.rooms[id];
      const [x, y] = room.stand!;
      expect(x).toBeGreaterThanOrEqual(x1);
      expect(x).toBeLessThanOrEqual(x2);
      expect(y).toBeGreaterThanOrEqual(y1);
      expect(y).toBeLessThanOrEqual(y2);
    }
  });

  it("frames the minimap exactly as the plan SVG is drawn", () => {
    const f = planSvgFrame(TLV3_TWIN);
    expect(exp.walk.plan).toEqual({ image: "/walk/tlv3/plan.svg", x0: expect.closeTo(f.x0, 3), yTop: expect.closeTo(f.yTop, 3), w: expect.closeTo(f.w, 3), h: expect.closeTo(f.h, 3) });
  });
});

/** In-memory Storage double. */
function memStorage(): Storage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(key, data) { files.set(key, Buffer.from(data)); },
    async get(key) { return files.get(key) ?? null; },
    url: (key) => `mem://${key}`,
  };
}

describe("build jobs", () => {
  it("slug is URL- and storage-safe", () => {
    expect(buildSlug("cmtkb59vy000gy8phuiymfc9w")).toBe("ut-cmtkb59vy000gy8phuiymfc9w");
    expect(buildSlug("Seed_Yarkon 4")).toBe("ut-seed-yarkon-4");
    expect(buildJobKey("seed-yarkon-4")).toBe("builds/ut-seed-yarkon-4/job.json");
  });

  it("queues, reads back and reports a job", async () => {
    const s = memStorage();
    const approvedAt = new Date("2026-11-20T10:00:00Z");
    const job = await queueBuild(s, "seed-yarkon-4", approvedAt, { now: new Date("2026-11-20T10:00:01Z") });
    expect(job.status).toBe("queued");
    expect(await readBuildJob(s, "seed-yarkon-4")).toEqual(job);

    const view = toBuildView(job, approvedAt)!;
    expect(view).toMatchObject({ status: "queued", walkUrl: null, stale: false });
  });

  it("links the walk only when done, and flags a newer approval as stale", async () => {
    const s = memStorage();
    const approvedAt = new Date("2026-11-20T10:00:00Z");
    const done: BuildJob = { ...(await queueBuild(s, "u1", approvedAt)), status: "done", finishedAt: "2026-11-20T10:20:00Z" };
    await writeBuildJob(s, done);
    expect(toBuildView(done, approvedAt)).toMatchObject({ status: "done", walkUrl: "/walk/ut-u1", stale: false });
    expect(toBuildView(done, new Date("2026-11-21T00:00:00Z"))!.stale).toBe(true);
    expect(toBuildView(done, null)!.stale).toBe(true);
  });

  it("keeps linking the earlier walk while a rebuild is queued or running", async () => {
    const s = memStorage();
    const approvedAt = new Date("2026-11-20T10:00:00Z");
    await writeBuildJob(s, { ...(await queueBuild(s, "u2", approvedAt)), status: "done" });
    const again = await queueBuild(s, "u2", approvedAt, { preview: true });
    expect(again.status).toBe("queued");
    expect(toBuildView(again, approvedAt)).toMatchObject({ status: "queued", walkUrl: "/walk/ut-u2" });
    expect(toBuildView(await queueBuild(s, "never-built", approvedAt), approvedAt)!.walkUrl).toBeNull();
  });

  it("refuses a quick rebuild of a quick build from the same approval", () => {
    const done = { status: "done" as const, preview: true, approvedAt: "2026-11-20T10:00:00.000Z" };
    expect(isRedundantPreview(done, done.approvedAt, true)).toBe(true);
    expect(isRedundantPreview(done, done.approvedAt, false)).toBe(false); // full quality is a real change
    expect(isRedundantPreview(done, "2026-11-21T00:00:00.000Z", true)).toBe(false); // newer approval
    expect(isRedundantPreview({ ...done, preview: false }, done.approvedAt, true)).toBe(false);
    expect(isRedundantPreview({ ...done, status: "failed" as never }, done.approvedAt, true)).toBe(false);
    expect(isRedundantPreview(null, done.approvedAt, true)).toBe(false);
  });

  it("ignores a corrupt job file instead of throwing", async () => {
    const s = memStorage();
    s.files.set(buildJobKey("u2"), Buffer.from(JSON.stringify({ status: "weird" })));
    expect(await readBuildJob(s, "u2")).toBeNull();
  });
});
