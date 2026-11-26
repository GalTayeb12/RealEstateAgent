#!/usr/bin/env node
// Live check of /api/studio/* against the dev server (STUDIO_ENABLED=1, file store).
//   JWT_SECRET=... node scripts/studio/e2e-api.mjs [--base=http://localhost:3001]
import fs from "node:fs";
import jwt from "jsonwebtoken";
import { rolesOpen } from "./roles.mjs";

const base = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3001").slice(7);
const secret = process.env.JWT_SECRET ?? "studio-bench-dummy";
const tok = (role, userId) => jwt.sign({ userId, email: `${userId}@example.test`, role }, secret, { expiresIn: "1h" });
const A = tok("developer", "api-user-a"), B = tok("admin", "api-user-b"), BUYER = tok("buyer", "api-buyer");
const results = [];
const check = (name, ok, extra = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const call = async (method, path, { token, body, cookie } = {}) => {
  const r = await fetch(base + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: `hq_session=${cookie}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const doc = (name) => ({ schemaVersion: 1, baseline: { id: "yarkon-twin-shell", version: 1, twinHash: "x" }, name, nodes: {}, overrides: {} });

check("anonymous gets 404", (await call("GET", "/api/studio/designs")).status === 404);
{ const s = (await call("GET", "/api/studio/designs", { token: BUYER })).status; check(rolesOpen ? "a buyer is let in (STUDIO_ROLES=*)" : "buyer gets 404", rolesOpen ? s !== 404 : s === 404); }
let r = await call("POST", "/api/studio/designs", { token: A, body: { data: doc("API test"), name: "API test" } });
check("developer creates a design", r.status === 201, r.json?.design?.id);
const id = r.json.design.id;
check("cookie auth works too (proxy copies it)", (await call("GET", `/api/studio/designs/${id}`, { cookie: A })).status === 200);
check("owner lists it", (await call("GET", "/api/studio/designs?baseline=yarkon-twin-shell", { token: A })).json.designs.some((d) => d.id === id));
check("other user cannot read it", (await call("GET", `/api/studio/designs/${id}`, { token: B })).status === 404);
r = await call("PUT", `/api/studio/designs/${id}`, { token: A, body: { data: doc("v2"), revision: 1 } });
check("save bumps the revision", r.status === 200 && r.json.design.revision === 2);
r = await call("PUT", `/api/studio/designs/${id}`, { token: A, body: { data: doc("v3"), revision: 1 } });
check("stale save is 409", r.status === 409 && r.json.currentRevision === 2);
check("invalid document is 400", (await call("PUT", `/api/studio/designs/${id}`, { token: A, body: { data: { bad: 1 }, revision: 2 } })).status === 400);
r = await call("POST", `/api/studio/designs/${id}/versions`, { token: A, body: { label: "Before sofa" } });
check("named version saved", r.status === 201);
const vid = r.json.version.id;
await call("PUT", `/api/studio/designs/${id}`, { token: A, body: { data: doc("v4"), revision: 2 } });
r = await call("POST", `/api/studio/designs/${id}/versions/${vid}/restore`, { token: A, body: { revision: 3 } });
check("restore creates a new revision with the old content", r.status === 200 && r.json.design.revision === 4 && r.json.design.data.name === "v2");
r = await call("POST", `/api/studio/designs/${id}/duplicate`, { token: A, body: {} });
check("duplicate", r.status === 201 && r.json.design.id !== id);
const dup = r.json.design.id;
r = await call("POST", `/api/studio/designs/${id}/shares`, { token: A, body: { permission: "view" } });
check("view share created", r.status === 201 && typeof r.json.token === "string");
const viewTok = r.json.token, viewShare = r.json.share.id;
r = await call("GET", `/api/studio/shared/${viewTok}`);
check("public read via link, no owner id", r.status === 200 && r.json.permission === "view" && !JSON.stringify(r.json).includes("api-user-a"));
check("view link cannot write", (await call("PUT", `/api/studio/shared/${viewTok}`, { body: { data: doc("hax"), revision: 4 } })).status === 404);
r = await call("POST", `/api/studio/designs/${id}/shares`, { token: A, body: { permission: "edit" } });
const editTok = r.json.token;
r = await call("PUT", `/api/studio/shared/${editTok}`, { body: { data: doc("by link"), revision: 4 } });
check("edit link can write", r.status === 200 && r.json.design.revision === 5);
await call("DELETE", `/api/studio/designs/${id}/shares/${viewShare}`, { token: A });
check("revoked link is gone", (await call("GET", `/api/studio/shared/${viewTok}`)).status === 404);
check("unknown token is 404", (await call("GET", "/api/studio/shared/not-a-token")).status === 404);
check("delete", (await call("DELETE", `/api/studio/designs/${id}`, { token: A })).status === 200 && (await call("GET", `/api/studio/designs/${id}`, { token: A })).status === 404);
check("edit link dies with the design", (await call("GET", `/api/studio/shared/${editTok}`)).status === 404);
await call("DELETE", `/api/studio/designs/${dup}`, { token: A });
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
