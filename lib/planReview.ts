/**
 * Developer plan review: the pure logic behind /api/dev/unit-types/[id]/plan.
 * Parse an uploaded plan, re-validate a corrected twin, decide the status and
 * whether approval is allowed. No database or storage access here, so it is
 * unit tested directly (lib/__tests__/planReview.test.ts).
 */
import { PlanTwin } from "./twin/schema";
import { parseDxf } from "./twin/dxf/parse";
import { validateTwin, type Report } from "./twin/validate";
import { safeFileName } from "./storage";
import { DwgConversionError, dwgToDxf, isDwg } from "./twin/dwg";

export const PLAN_STATUSES = ["parsed", "needs_review", "approved"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Upload limit for a plan file. Real apartment DXFs are well under this. */
export const MAX_PLAN_BYTES = 15 * 1024 * 1024;

export class PlanInputError extends Error {
  constructor(public readonly status: number, public readonly he: string, public readonly en: string) {
    super(en);
  }
}

/** No errors → ready for approval ("parsed"); otherwise the developer has to fix it. */
export function statusFor(report: Report): Exclude<PlanStatus, "approved"> {
  return report.ok ? "parsed" : "needs_review";
}

export function canApprove(report: Pick<Report, "ok" | "issues">): boolean {
  return report.ok && !report.issues.some((i) => i.level === "error");
}

/** Validate the uploaded file's name and size before reading it. */
export function checkPlanFile(file: { name: string; size: number }): void {
  if (!/\.(dxf|dwg)$/i.test(file.name)) {
    throw new PlanInputError(415, "יש להעלות קובץ DXF או DWG.", "Upload a DXF or DWG file.");
  }
  if (file.size <= 0) throw new PlanInputError(400, "הקובץ ריק", "The file is empty");
  if (file.size > MAX_PLAN_BYTES) {
    const mb = MAX_PLAN_BYTES / 1024 / 1024;
    throw new PlanInputError(413, `הקובץ גדול מ-${mb} MB`, `The file is larger than ${mb} MB`);
  }
}

/** DXF text: UTF-8 (R2007+), falling back to Windows-1255 for older Hebrew drawings. */
export function decodeDxf(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}

/**
 * The DXF text of an uploaded plan, and what kind of file it was. A DWG is
 * recognised by its content (not only its name) and converted first; when no
 * converter is set up the developer is told to export a DXF instead.
 */
export async function readPlanUpload(bytes: Uint8Array, fileName: string): Promise<{ dxf: Uint8Array; kind: "dxf" | "dwg" }> {
  if (!isDwg(bytes)) {
    if (/\.dwg$/i.test(fileName)) throw new PlanInputError(422, "הקובץ אינו DWG תקין", "The file is not a valid DWG");
    return { dxf: bytes, kind: "dxf" };
  }
  try {
    return { dxf: await dwgToDxf(bytes), kind: "dwg" };
  } catch (err) {
    if (err instanceof DwgConversionError) {
      if (err.code === "not_configured") {
        throw new PlanInputError(501, "קובצי DWG עדיין לא נתמכים בשרת הזה. שמרו את התוכנית כ-DXF (Save As → DXF) והעלו אותה.", "DWG files are not supported on this server yet. Save the plan as DXF (Save As → DXF) and upload that.");
      }
      throw new PlanInputError(422, "לא הצלחנו להמיר את קובץ ה-DWG. שמרו אותו כ-DXF והעלו שוב.", `The DWG could not be converted (${err.code}). Save it as DXF and upload that.`);
    }
    throw err;
  }
}

export interface ParsedPlan {
  twin: PlanTwin;
  report: Report;
  notes: string[];
  status: Exclude<PlanStatus, "approved">;
}

/** Uploaded DXF bytes → twin + validation report. Throws PlanInputError on unreadable files. */
export function parsePlanUpload(bytes: Uint8Array, fileName: string): ParsedPlan {
  let parsed: ReturnType<typeof parseDxf>;
  try {
    parsed = parseDxf(decodeDxf(bytes), { file: fileName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PlanInputError(422, `לא ניתן לקרוא את קובץ ה-DXF: ${msg}`, `Could not read the DXF file: ${msg}`);
  }
  const report = validateTwin(parsed.twin);
  return { twin: parsed.twin, report, notes: parsed.notes, status: statusFor(report) };
}

/**
 * A corrected twin from the review screen → the normalised twin and a fresh report.
 * The source block is kept from the stored twin so the client cannot rewrite provenance.
 */
export function reviewCorrectedTwin(input: unknown, stored: PlanTwin): { twin: PlanTwin; report: Report; status: Exclude<PlanStatus, "approved"> } {
  const parsed = PlanTwin.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? `${first.path.join(".")}: ${first.message}` : "";
    throw new PlanInputError(400, `מבנה התוכנית אינו תקין (${where})`, `The plan data is not valid (${where})`);
  }
  const twin: PlanTwin = { ...parsed.data, source: stored.source };
  const report = validateTwin(twin);
  return { twin, report, status: statusFor(report) };
}

/** Storage key for an uploaded plan; timestamped so earlier uploads are kept. */
export function planSourceKey(unitTypeId: string, fileName: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  return `plans/${safeFileName(unitTypeId)}/${stamp}-${safeFileName(fileName)}`;
}

/** Who may act on a unit type's plan: an approved developer who owns the unit type. */
export function planAccess(
  auth: { userId: string; role: string } | null,
  profile: { crnStatus: string } | null,
  unitType: { sellerId: string } | null,
): { ok: true } | { ok: false; status: 401 | 403 | 404; error: string } {
  if (!auth || auth.role !== "developer") return { ok: false, status: 401, error: "Unauthorized" };
  if (!profile || profile.crnStatus !== "approved") return { ok: false, status: 403, error: "Account not approved" };
  if (!unitType) return { ok: false, status: 404, error: "Unit type not found" };
  if (unitType.sellerId !== auth.userId) return { ok: false, status: 404, error: "Unit type not found" };
  return { ok: true };
}

/** The stored record as the review screen consumes it. */
export interface PlanRecordView {
  status: PlanStatus;
  twin: PlanTwin;
  report: Report;
  notes: string[];
  source: { name: string; kind: string };
  approvedAt: string | null;
  updatedAt: string;
}

export function toPlanView(r: {
  status: string; twin: unknown; report: unknown; notes: string[]; sourceName: string; sourceKind: string;
  approvedAt: Date | null; updatedAt: Date;
}): PlanRecordView {
  return {
    status: (PLAN_STATUSES as readonly string[]).includes(r.status) ? (r.status as PlanStatus) : "needs_review",
    twin: r.twin as PlanTwin,
    report: r.report as Report,
    notes: r.notes,
    source: { name: r.sourceName, kind: r.sourceKind },
    approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  };
}
