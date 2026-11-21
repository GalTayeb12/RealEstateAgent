import { describe, expect, it } from "vitest";
import { entryVideoRequest, flyInPrompt, generateVideo, HiggsfieldError, uploadImage, type FetchLike } from "../higgsfield";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("higgsfield client", () => {
  it("uploads to the presigned URL without sending the API key there", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/files/generate-upload-url")) return json({ public_url: "https://cdn/x.png", upload_url: "https://s3/put", upload_headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" } });
      return new Response(null, { status: 200 });
    };
    const url = await uploadImage(new Uint8Array([1, 2, 3]), "image/png", { key: "id:secret", fetchImpl: f });
    expect(url).toBe("https://cdn/x.png");
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe("Key id:secret");
    const put = calls[1];
    expect(put.url).toBe("https://s3/put");
    expect(JSON.stringify(put.init!.headers)).not.toContain("secret");
    expect((put.init!.headers as Record<string, string>)["x-amz-tagging"]).toBe("retention=temporary");
  });

  it("submits, polls until completed and returns the video URL", async () => {
    let polls = 0;
    const f: FetchLike = async (url) => {
      if (url.endsWith("/image-to-video")) return json({ request_id: "r1", status_url: "https://api/status/r1" });
      polls++;
      return json(polls < 3 ? { status: "in_progress" } : { status: "completed", video: { url: "https://cdn/v.mp4" } });
    };
    const r = await generateVideo(entryVideoRequest("https://a", "https://b"), { key: "k", fetchImpl: f, pollMs: 0 });
    expect(r).toMatchObject({ requestId: "r1", videoUrl: "https://cdn/v.mp4" });
    expect(polls).toBe(3);
  });

  it("fails clearly on a refused or failed generation", async () => {
    const f: FetchLike = async (url) => (url.endsWith("/image-to-video") ? json({ request_id: "r", status_url: "https://s" }) : json({ status: "nsfw" }));
    await expect(generateVideo(entryVideoRequest("a", "b"), { key: "k", fetchImpl: f, pollMs: 0 })).rejects.toBeInstanceOf(HiggsfieldError);
    const bad: FetchLike = async () => json({ error: "nope" }, 401);
    await expect(generateVideo(entryVideoRequest("a", "b"), { key: "k", fetchImpl: bad })).rejects.toThrow(/401/);
  });

  it("builds the Yarkon-style request: 8 s, 720p, no audio, both pictures", () => {
    const r = entryVideoRequest("https://start", "https://end", { floor: 7 });
    expect(r.model).toBe("bytedance/seedance-2.0/image-to-video");
    expect(r.body).toMatchObject({ image_url: "https://start", end_image_url: "https://end", duration: 8, resolution: "720p", generate_audio: false });
    expect(String(r.body.prompt)).toContain("floor 7");
    expect(flyInPrompt()).toContain("no cuts");
  });
});
