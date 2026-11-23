// Read-only security probes against the local dev server. Session cookie comes from a Playwright state file (env HQ_STATE).
import fs from "node:fs";
const B = "http://localhost:3001";
const st = JSON.parse(fs.readFileSync(process.env.HQ_STATE, "utf8"));
const cookie = st.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const res = [];
const t = async (name, url, init = {}, want) => {
  const r = await fetch(B + url, { redirect: "manual", ...init, headers: { ...(init.headers || {}) } });
  const ok = want.includes(r.status);
  res.push(`${ok ? "PASS" : "FAIL"} ${r.status} ${name}`);
};
const sqli = ["' OR '1'='1", "1; DROP TABLE \"User\";--", "\" OR 1=1 --"];
for (const p of sqli) {
  await t(`login SQLi ${p.slice(0, 12)}`, "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: p, password: p }) }, [400, 401]);
  await t(`aom id SQLi ${p.slice(0, 12)}`, "/api/aom/" + encodeURIComponent(p), { headers: { cookie } }, [400, 404]);
  await t(`admin users q SQLi ${p.slice(0, 12)}`, "/api/dev/admin/users?q=" + encodeURIComponent(p), { headers: { cookie } }, [400, 401, 403]);
}
await t("ledger anonymous", "/api/ledger", {}, [401, 403]);
await t("ledger as non-admin", "/api/ledger", { headers: { cookie } }, [401, 403]);
await t("admin stats anonymous", "/api/dev/admin/stats", {}, [401]);
await t("admin stats non-admin", "/api/dev/admin/stats", { headers: { cookie } }, [401, 403]);
await t("tampered JWT", "/api/buyer/profile", { headers: { Authorization: "Bearer abc.def.ghi" } }, [401]);
await t("alg none JWT", "/api/buyer/profile", { headers: { Authorization: "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ4Iiwicm9sZSI6ImFkbWluIn0." } }, [401]);
await t("CSRF evil origin", "/api/auth/session", { method: "DELETE", headers: { cookie, Origin: "https://evil.example" } }, [403]);
await t("stage path traversal", "/api/stage/..%2F..%2Fetc/on.json", {}, [404]);
await t("cron anonymous (200 only when CRON_SECRET unset in dev)", "/api/cron/daily-digest", {}, [200, 401, 503]);
for (let i = 0; i < 12; i++) await t(`login brute ${i}`, "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.com", password: "wrongpass1" }) }, [401, 429]);
const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@example.com", password: "wrongpass1" }) });
res.push(`${r.status === 429 ? "PASS" : "FAIL"} ${r.status} login rate limit kicks in`);
const h = (await fetch(B + "/")).headers;
for (const k of ["x-content-type-options", "x-frame-options", "referrer-policy"]) res.push(`${h.get(k) ? "PASS" : "FAIL"} header ${k}`);
console.log(res.filter((x) => !x.includes("login brute")).join("\n"));
