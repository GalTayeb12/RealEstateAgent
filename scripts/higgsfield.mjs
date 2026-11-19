#!/usr/bin/env node
/**
 * Minimal Higgsfield API runner: submit → poll → download.
 *
 *   node scripts/higgsfield.mjs <model-path> <body.json> <out-file>
 *
 * Reads HIGGSFIELD_API_KEY ("<key_id>:<secret>") from .env.local. Never prints it.
 * Each run is billed by Higgsfield (failed generations are refunded by them).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const [model, bodyFile, outFile] = process.argv.slice(2);
if (!model || !bodyFile || !outFile) {
  console.error("usage: node scripts/higgsfield.mjs <model-path> <body.json> <out-file>");
  process.exit(2);
}

const env = readFileSync(".env.local", "utf8");
const key = env.match(/^HIGGSFIELD_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!key) { console.error("HIGGSFIELD_API_KEY missing in .env.local"); process.exit(2); }

const API = "https://api.higgsfield.ai";
const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
const body = readFileSync(bodyFile, "utf8");

const submit = await fetch(`${API}/${model}`, {
  method: "POST",
  headers: { ...headers, "Idempotency-Key": randomUUID() },
  body,
});
const sub = await submit.json().catch(() => ({}));
if (!submit.ok) { console.error(`submit failed HTTP ${submit.status}`, JSON.stringify(sub)); process.exit(1); }
console.log("request", sub.request_id, sub.status);

const statusUrl = sub.status_url ?? `${API}/requests/${sub.request_id}/status`;
const started = Date.now();
let res;
for (;;) {
  await new Promise((r) => setTimeout(r, 4000));
  const r = await fetch(statusUrl, { headers });
  res = await r.json().catch(() => ({}));
  process.stdout.write(`\r${res.status} ${Math.round((Date.now() - started) / 1000)}s   `);
  if (["completed", "failed", "nsfw", "canceled"].includes(res.status)) break;
  if (Date.now() - started > 15 * 60 * 1000) { console.error("\ntimeout"); process.exit(1); }
}
console.log();
if (res.status !== "completed") { console.error("ended:", res.status, JSON.stringify(res).slice(0, 500)); process.exit(1); }

const url = res.images?.[0]?.url ?? res.video?.url ?? res.videos?.[0]?.url ?? res.output?.[0]?.url;
if (!url) { console.error("no output url", JSON.stringify(res).slice(0, 800)); process.exit(1); }
const file = await fetch(url);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, Buffer.from(await file.arrayBuffer()));
writeFileSync(`${outFile}.json`, JSON.stringify({ model, request_id: sub.request_id, body: JSON.parse(body), url }, null, 2));
console.log("saved", outFile);
