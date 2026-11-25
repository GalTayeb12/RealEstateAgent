import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** POST { revision } restores a version as a new revision (history is kept). */
export const POST = owner(async ({ repo, user, params, body }) => ops.restore(repo, user, params.id, params.vid, await body()));
