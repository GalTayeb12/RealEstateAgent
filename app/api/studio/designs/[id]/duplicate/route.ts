import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** POST /api/studio/designs/[id]/duplicate { name? } */
export const POST = owner(async ({ repo, user, params, body }) => ops.duplicate(repo, user, params.id, await body()));
