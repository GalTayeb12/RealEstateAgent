/**
 * Higgsfield API client (https://docs.higgsfield.ai): upload an image, submit a
 * generation, poll it, download the result. Used by scripts/twin/entry-video.ts
 * for the building → apartment fly-in clip.
 *
 * Every generation is billed by Higgsfield, so nothing here runs by itself: the
 * caller decides (the CLI needs --yes). The key is read from HIGGSFIELD_API_KEY
 * ("<key_id>:<secret>") and is never logged.
 */
const API = "https://api.higgsfield.ai";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HiggsfieldOptions {
  key: string;
  fetchImpl?: FetchLike;
  /** Milliseconds between status checks (tests set 0). */
  pollMs?: number;
  /** Give up after this long. */
  timeoutMs?: number;
}

export class HiggsfieldError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

const auth = (key: string) => ({ Authorization: `Key ${key}`, "Content-Type": "application/json" });

/** Upload bytes and return the public URL to pass as image_url / end_image_url. */
export async function uploadImage(bytes: Uint8Array, contentType: string, o: HiggsfieldOptions): Promise<string> {
  const f = o.fetchImpl ?? fetch;
  const res = await f(`${API}/files/generate-upload-url`, { method: "POST", headers: auth(o.key), body: JSON.stringify({ content_type: contentType }) });
  const j = (await res.json().catch(() => ({}))) as { public_url?: string; upload_url?: string; upload_headers?: Record<string, string> };
  if (!res.ok || !j.upload_url || !j.public_url) throw new HiggsfieldError(`upload URL failed (HTTP ${res.status})`, res.status);
  // the presigned storage URL gets the returned headers only: never the API key
  const put = await f(j.upload_url, { method: "PUT", headers: j.upload_headers ?? { "Content-Type": contentType }, body: bytes as unknown as BodyInit });
  if (!put.ok) throw new HiggsfieldError(`upload failed (HTTP ${put.status})`, put.status);
  return j.public_url;
}

export interface VideoRequest {
  /** e.g. "bytedance/seedance-2.0/image-to-video" */
  model: string;
  body: Record<string, unknown>;
}

export interface VideoResult { requestId: string; videoUrl: string; model: string; body: Record<string, unknown> }

/** Submit, poll until done, return the video URL. Throws on failure, timeout or a refused result. */
export async function generateVideo(req: VideoRequest, o: HiggsfieldOptions): Promise<VideoResult> {
  const f = o.fetchImpl ?? fetch;
  const submit = await f(`${API}/${req.model}`, {
    method: "POST",
    headers: { ...auth(o.key), "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(req.body),
  });
  const sub = (await submit.json().catch(() => ({}))) as { request_id?: string; status_url?: string };
  if (!submit.ok || !sub.request_id) throw new HiggsfieldError(`submit failed (HTTP ${submit.status})`, submit.status);

  const statusUrl = sub.status_url ?? `${API}/requests/${sub.request_id}/status`;
  const started = Date.now();
  const limit = o.timeoutMs ?? 15 * 60 * 1000;
  for (;;) {
    if (o.pollMs) await new Promise((r) => setTimeout(r, o.pollMs));
    const r = await f(statusUrl, { headers: auth(o.key) });
    const s = (await r.json().catch(() => ({}))) as { status?: string; video?: { url?: string }; videos?: { url?: string }[]; output?: { url?: string }[] };
    if (s.status === "completed") {
      const url = s.video?.url ?? s.videos?.[0]?.url ?? s.output?.[0]?.url;
      if (!url) throw new HiggsfieldError("the generation finished without a video URL");
      return { requestId: sub.request_id, videoUrl: url, model: req.model, body: req.body };
    }
    if (s.status === "failed" || s.status === "nsfw" || s.status === "canceled") throw new HiggsfieldError(`the generation ended: ${s.status}`);
    if (Date.now() - started > limit) throw new HiggsfieldError("the generation timed out");
  }
}

export const SEEDANCE_IMAGE_TO_VIDEO = "bytedance/seedance-2.0/image-to-video";

/**
 * The fly-in prompt, from the one that made the Yarkon clip: wide building view →
 * the lit floor → balcony → into the living room. Generic on purpose: the
 * start and end pictures decide what is shown, the words only decide the motion.
 */
export function flyInPrompt(opts: { floor?: number } = {}): string {
  const floor = opts.floor ? `the apartment on floor ${opts.floor}` : "one apartment in the middle of the building";
  return [
    "One continuous cinematic drone shot, smooth and stable like a gimbal, no cuts.",
    "The camera glides forward from the wide view of the building at blue hour, slowly rising and curving toward the facade;",
    `the warm lights of ${floor} switch on as the camera approaches.`,
    "The camera flies straight toward that glowing floor, passes the balcony glass railing, and smoothly moves through the open glass door into the warmly lit living room, settling on the final interior view.",
    "Realistic parallax, natural motion blur, architecture stays perfectly consistent, no text, no people.",
  ].join(" ");
}

export function entryVideoRequest(startUrl: string, endUrl: string, opts: { floor?: number; duration?: number; resolution?: "720p" | "1080p" } = {}): VideoRequest {
  return {
    model: SEEDANCE_IMAGE_TO_VIDEO,
    body: {
      image_url: startUrl,
      end_image_url: endUrl,
      duration: opts.duration ?? 8,
      resolution: opts.resolution ?? "720p",
      generate_audio: false,
      prompt: flyInPrompt({ floor: opts.floor }),
    },
  };
}
