/**
 * Build jobs: an approved plan twin → walkthrough assets + experience config.
 *
 * Approving a plan queues a job; scripts/twin/build-worker.ts picks queued
 * jobs up, runs scripts/twin/build-walk.mjs (headless Blender) and publishes
 * /walk/<slug>. The job state is one small JSON per unit type in file storage
 * (lib/storage.ts), so no schema change is needed until builds move to a
 * real queue:
 *
 *   builds/<unitTypeId>/job.json
 *
 * A job remembers which approval it was built from (approvedAt); a newer
 * approval makes it stale and queues a fresh one.
 */
import { z } from "zod";
import type { Storage } from "@/lib/storage";

export const BUILD_STATUSES = ["queued", "running", "done", "failed"] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const BuildJob = z.object({
  unitTypeId: z.string().min(1),
  /** URL key of the result: /walk/<slug>, public/projects/<slug>/experience.json. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  status: z.enum(BUILD_STATUSES),
  /** Fast bake (2048² / 256 spp, minutes) instead of the full one (~20 min). */
  preview: z.boolean().default(false),
  /** The plan approval this job builds (PlanTwinRecord.approvedAt, ISO). */
  approvedAt: z.string(),
  queuedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  /** Short reason when failed (also shown to the developer). */
  error: z.string().optional(),
  /** Tail of the build output, for debugging a failed build. */
  log: z.string().optional(),
});
export type BuildJob = z.infer<typeof BuildJob>;

/** Walk slug for a unit type: stable, URL- and folder-safe. */
export function buildSlug(unitTypeId: string): string {
  const s = unitTypeId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `ut-${s || "unit"}`;
}

export function buildJobKey(unitTypeId: string): string {
  return `builds/${buildSlug(unitTypeId)}/job.json`;
}

export async function readBuildJob(storage: Storage, unitTypeId: string): Promise<BuildJob | null> {
  const raw = await storage.get(buildJobKey(unitTypeId));
  if (!raw) return null;
  const parsed = BuildJob.safeParse(JSON.parse(raw.toString("utf8")));
  return parsed.success ? parsed.data : null;
}

export async function writeBuildJob(storage: Storage, job: BuildJob): Promise<void> {
  const valid = BuildJob.parse(job);
  await storage.put(buildJobKey(valid.unitTypeId), new TextEncoder().encode(JSON.stringify(valid, null, 2)), {
    contentType: "application/json",
  });
}

/** Queue (or re-queue) the build of an approved plan. Returns the new job. */
export async function queueBuild(
  storage: Storage,
  unitTypeId: string,
  approvedAt: Date,
  opts: { preview?: boolean; now?: Date } = {},
): Promise<BuildJob> {
  const job: BuildJob = {
    unitTypeId,
    slug: buildSlug(unitTypeId),
    status: "queued",
    preview: opts.preview ?? false,
    approvedAt: approvedAt.toISOString(),
    queuedAt: (opts.now ?? new Date()).toISOString(),
  };
  await writeBuildJob(storage, job);
  return job;
}

/** What the developer screen shows about the build of the current plan. */
export interface BuildView {
  status: BuildStatus;
  /** /walk/<slug> once done. */
  walkUrl: string | null;
  preview: boolean;
  queuedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Built from an earlier approval than the plan's current one. */
  stale: boolean;
}

export function toBuildView(job: BuildJob | null, planApprovedAt: Date | null): BuildView | null {
  if (!job) return null;
  return {
    status: job.status,
    walkUrl: job.status === "done" ? `/walk/${job.slug}` : null,
    preview: job.preview,
    queuedAt: job.queuedAt,
    finishedAt: job.finishedAt ?? null,
    error: job.error ?? null,
    stale: !planApprovedAt || planApprovedAt.toISOString() !== job.approvedAt,
  };
}
