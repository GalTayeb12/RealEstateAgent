import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** GET · PUT { data, revision } · PATCH { name } · DELETE  on one design (owner only). */
export const GET = owner(({ repo, user, params }) => ops.get(repo, user, params.id));
export const PUT = owner(async ({ repo, user, params, body }) => ops.save(repo, user, params.id, await body()));
export const PATCH = owner(async ({ repo, user, params, body }) => ops.rename(repo, user, params.id, await body()));
export const DELETE = owner(({ repo, user, params }) => ops.remove(repo, user, params.id));
