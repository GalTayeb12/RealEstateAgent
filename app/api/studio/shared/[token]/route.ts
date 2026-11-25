import { ops } from "@/lib/studio/persist/ops";
import { shared } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** Public, token-addressed: GET returns the design (no owner id); PUT { data, revision } saves through an edit link. */
export const GET = shared(({ repo, params }) => ops.sharedGet(repo, params.token));
export const PUT = shared(async ({ repo, params, body }) => ops.sharedSave(repo, params.token, await body()));
