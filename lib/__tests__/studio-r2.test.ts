import { describe, expect, it } from "vitest";
import { R2Storage, r2FromEnv } from "../storageR2";

const cfg = { accountId: "acc123", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secretsecretsecret", bucket: "haveniq-assets" };

function fakeFetch(handler: (req: Request) => Response) {
  const calls: Request[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req.clone());
    return handler(req);
  }) as typeof fetch;
  return { f, calls };
}

describe("R2 storage driver (inactive until configured)", () => {
  it("signs PUT requests with SigV4 for the account endpoint", async () => {
    const { f, calls } = fakeFetch(() => new Response(null, { status: 200 }));
    await new R2Storage(cfg, f).put("catalog/sofa/1/model.glb", new Uint8Array([1, 2, 3]), { contentType: "model/gltf-binary" });
    const req = calls[0];
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://acc123.r2.cloudflarestorage.com/haveniq-assets/catalog/sofa/1/model.glb");
    expect(req.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(req.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/);
    expect(req.headers.get("x-amz-date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(await req.arrayBuffer()).toHaveProperty("byteLength", 3);
  });

  it("returns bytes on 200, null on 404, throws on other errors", async () => {
    const ok = fakeFetch(() => new Response(new Uint8Array([9, 8]), { status: 200 }));
    expect([...(await new R2Storage(cfg, ok.f).get("a/b.bin"))!]).toEqual([9, 8]);
    expect(ok.calls[0].method).toBe("GET");
    expect(await new R2Storage(cfg, fakeFetch(() => new Response(null, { status: 404 })).f).get("missing")).toBeNull();
    await expect(new R2Storage(cfg, fakeFetch(() => new Response(null, { status: 403 })).f).get("x")).rejects.toThrow(/403/);
    await expect(new R2Storage(cfg, fakeFetch(() => new Response(null, { status: 500 })).f).put("x", new Uint8Array())).rejects.toThrow(/500/);
  });

  it("rejects keys that could escape the bucket path", async () => {
    const s = new R2Storage(cfg, fakeFetch(() => new Response(null)).f);
    await expect(s.get("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
    expect(() => s.url("a/../b")).toThrow(/Invalid storage key/);
  });

  it("url() uses the public base when set, the endpoint otherwise", () => {
    expect(new R2Storage({ ...cfg, publicBaseUrl: "https://cdn.example.com/" }).url("a/b.glb")).toBe("https://cdn.example.com/a/b.glb");
    expect(new R2Storage(cfg).url("a/b.glb")).toBe("https://acc123.r2.cloudflarestorage.com/haveniq-assets/a/b.glb");
  });

  it("r2FromEnv names the missing variable and builds from a full environment", () => {
    expect(() => r2FromEnv({})).toThrow(/R2_ACCOUNT_ID/);
    expect(() => r2FromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c" })).toThrow(/R2_BUCKET/);
    expect(r2FromEnv({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" })).toBeInstanceOf(R2Storage);
  });
});
