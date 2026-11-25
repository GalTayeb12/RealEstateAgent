import { ops } from "@/lib/studio/persist/ops";
import { owner } from "@/lib/studio/persist/http";

export const dynamic = "force-dynamic";

/** GET /api/studio/designs?baseline=<id>  ·  POST /api/studio/designs { data, name? } */
export const GET = owner(({ repo, user, req }) => ops.list(repo, user, new URL(req.url).searchParams.get("baseline") ?? undefined));
export const POST = owner(async ({ repo, user, body }) => ops.create(repo, user, await body()));
