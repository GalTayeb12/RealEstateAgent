import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** GET list · POST { label } saves the current design as a named version. */
export const GET = owner(({ repo, user, params }) => ops.versions(repo, user, params.id));
export const POST = owner(async ({ repo, user, params, body }) => ops.addVersion(repo, user, params.id, await body()));
