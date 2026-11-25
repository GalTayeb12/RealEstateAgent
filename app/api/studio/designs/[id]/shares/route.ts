import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** GET list · POST { permission: "view" | "edit", expiresInDays? } returns the link token once. */
export const GET = owner(({ repo, user, params }) => ops.shares(repo, user, params.id));
export const POST = owner(async ({ repo, user, params, body }) => ops.createShare(repo, user, params.id, await body()));
