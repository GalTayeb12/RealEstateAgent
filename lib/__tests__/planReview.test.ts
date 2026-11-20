/**
 * Helpers behind the developer plan-review API (/api/dev/unit-types/[id]/plan)
 * and the local storage driver.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { YARKON_TWIN } from "../twin/fixtures/yarkon";
import { writeDxf } from "../twin/dxf/write";
import type { PlanTwin } from "../twin/schema";
import {
  MAX_PLAN_BYTES, PlanInputError, canApprove, checkPlanFile, decodeDxf, parsePlanUpload,
  planAccess, planSourceKey, reviewCorrectedTwin, statusFor, toPlanView,
} from "../planReview";
import { LocalDiskStorage, assertKey, safeFileName } from "../storage";

const yarkonBytes = new TextEncoder().encode(writeDxf(YARKON_TWIN));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function inputError(fn: () => unknown): PlanInputError {
  try { fn(); } catch (e) { if (e instanceof PlanInputError) return e; throw e; }
  throw new Error("expected PlanInputError");
}

describe("checkPlanFile", () => {
  it("accepts a DXF within the limit", () => {
    expect(() => checkPlanFile({ name: "Plan A.DXF", size: 1000 })).not.toThrow();
  });
  it("accepts DWG as well as DXF", () => {
    expect(() => checkPlanFile({ name: "plan.dwg", size: 1000 })).not.toThrow();
  });
  it("rejects other formats, empty and oversized files with bilingual messages", () => {
    const pdf = inputError(() => checkPlanFile({ name: "plan.pdf", size: 10 }));
    expect(pdf.status).toBe(415);
    expect(pdf.he).toMatch(/DXF/);
    expect(inputError(() => checkPlanFile({ name: "a.dxf", size: 0 })).status).toBe(400);
    expect(inputError(() => checkPlanFile({ name: "a.dxf", size: MAX_PLAN_BYTES + 1 })).status).toBe(413);
  });
});

describe("decodeDxf", () => {
  it("reads UTF-8 and falls back to Windows-1255 for old Hebrew DXFs", () => {
    expect(decodeDxf(new TextEncoder().encode("סלון"))).toBe("סלון");
    // "סלון" in cp1255: ס=0xF1 ל=0xEC ו=0xE5 ן=0xEF
    expect(decodeDxf(new Uint8Array([0xf1, 0xec, 0xe5, 0xef]))).toBe("סלון");
  });
});

describe("parsePlanUpload", () => {
  it("parses the Yarkon DXF with no errors, ready to approve", () => {
    const p = parsePlanUpload(yarkonBytes, "yarkon.dxf");
    expect(p.report.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(p.status).toBe("parsed");
    expect(p.twin.source).toMatchObject({ kind: "dxf", file: "yarkon.dxf" });
    expect(p.twin.rooms).toHaveLength(YARKON_TWIN.rooms.length);
    expect(canApprove(p.report)).toBe(true);
  });
  it("turns an unreadable file into a 422", () => {
    const e = inputError(() => parsePlanUpload(new TextEncoder().encode("not\na\ndxf\nfile"), "x.dxf"));
    expect(e.status).toBe(422);
  });
});

describe("reviewCorrectedTwin", () => {
  it("re-validates an edit and keeps the stored source", () => {
    const edited = clone(YARKON_TWIN);
    edited.rooms[0].name = { he: "סלון גדול", en: "Great room" };
    edited.source = { kind: "manual", file: "evil.dxf" };
    const r = reviewCorrectedTwin(edited, YARKON_TWIN);
    expect(r.twin.rooms[0].name.he).toBe("סלון גדול");
    expect(r.twin.source).toEqual(YARKON_TWIN.source);
    expect(r.status).toBe("parsed");
  });
  it("flags an edit that breaks the plan as needs_review, and approval is refused", () => {
    const edited = clone(YARKON_TWIN);
    const door = edited.openings.find((o) => o.kind === "door")!;
    door.wallId = "missing-wall";
    const r = reviewCorrectedTwin(edited, YARKON_TWIN);
    expect(r.status).toBe("needs_review");
    expect(r.report.issues.some((i) => i.code === "opening-wall" && i.ref === door.id)).toBe(true);
    expect(canApprove(r.report)).toBe(false);
  });
  it("rejects malformed twins with a 400", () => {
    const bad = { ...clone(YARKON_TWIN), rooms: [{ id: "x" }] };
    expect(inputError(() => reviewCorrectedTwin(bad, YARKON_TWIN)).status).toBe(400);
    expect(inputError(() => reviewCorrectedTwin(undefined, YARKON_TWIN)).status).toBe(400);
  });
});

describe("statusFor / canApprove", () => {
  const base = { areas: {}, netArea: 0, links: [] as [string, string][] };
  it("warnings alone do not block approval", () => {
    const report = { ...base, ok: true, issues: [{ level: "warning" as const, code: "no-window", he: "", en: "" }] };
    expect(statusFor(report)).toBe("parsed");
    expect(canApprove(report)).toBe(true);
  });
  it("errors block approval", () => {
    const report = { ...base, ok: false, issues: [{ level: "error" as const, code: "room-overlap", he: "", en: "" }] };
    expect(statusFor(report)).toBe("needs_review");
    expect(canApprove(report)).toBe(false);
  });
});

describe("planAccess", () => {
  const dev = { userId: "u1", role: "developer" };
  const approved = { crnStatus: "approved" };
  it("allows only the owning, approved developer", () => {
    expect(planAccess(dev, approved, { sellerId: "u1" })).toEqual({ ok: true });
    expect(planAccess(null, approved, { sellerId: "u1" })).toMatchObject({ ok: false, status: 401 });
    expect(planAccess({ userId: "u1", role: "buyer" }, approved, { sellerId: "u1" })).toMatchObject({ ok: false, status: 401 });
    expect(planAccess(dev, { crnStatus: "pending" }, { sellerId: "u1" })).toMatchObject({ ok: false, status: 403 });
    expect(planAccess(dev, null, { sellerId: "u1" })).toMatchObject({ ok: false, status: 403 });
    expect(planAccess(dev, approved, null)).toMatchObject({ ok: false, status: 404 });
    expect(planAccess(dev, approved, { sellerId: "someone-else" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("planSourceKey / toPlanView", () => {
  it("builds a safe, timestamped storage key", () => {
    const key = planSourceKey("ut_1", "../../תוכנית A.dxf", new Date("2026-11-20T10:11:12.345Z"));
    expect(key).toBe("plans/ut_1/20261120T101112-A.dxf");
    expect(() => assertKey(key)).not.toThrow();
  });
  it("shapes a stored record for the client", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    const v = toPlanView({
      status: "weird", twin: YARKON_TWIN, report: { ok: true, issues: [] }, notes: ["n"],
      sourceName: "a.dxf", sourceKind: "dxf", approvedAt: null, updatedAt: now,
    });
    expect(v.status).toBe("needs_review");
    expect(v.approvedAt).toBeNull();
    expect(v.updatedAt).toBe(now.toISOString());
    expect((v.twin as PlanTwin).rooms.length).toBe(YARKON_TWIN.rooms.length);
  });
});

describe("LocalDiskStorage", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "storage-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const s = new LocalDiskStorage(dir);

  it("puts, gets and gives a file URL", async () => {
    await s.put("plans/u1/a.dxf", new Uint8Array([1, 2, 3]));
    expect([...(await s.get("plans/u1/a.dxf"))!]).toEqual([1, 2, 3]);
    expect(await s.get("plans/u1/missing.dxf")).toBeNull();
    expect(s.url("plans/u1/a.dxf")).toMatch(/^file:\/\/.*plans\/u1\/a\.dxf$/);
  });
  it("refuses keys that escape the root", async () => {
    await expect(s.put("../x", new Uint8Array())).rejects.toThrow(/Invalid storage key/);
    expect(() => assertKey("/abs")).toThrow();
    expect(() => assertKey("a/../b")).toThrow();
    expect(() => assertKey("a\\b")).toThrow();
  });
  it("sanitises file names", () => {
    expect(safeFileName("C:\\plans\\..\\x y.dxf")).toBe("x_y.dxf");
    expect(safeFileName("..")).toBe("file");
  });
});
