import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** DELETE revokes a share link. */
export const DELETE = owner(({ repo, user, params }) => ops.revokeShare(repo, user, params.id, params.sid));
