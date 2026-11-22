// Submits a short scripted transcript through the real /api/transcript, then lets /processing run characterize + match.
import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ storageState: process.env.STATE, viewport:{width:1440,height:900} });
const p = await ctx.newPage(); const t0 = Date.now();
await p.goto("http://localhost:3001/profile", { waitUntil: "load" }); await p.waitForTimeout(1500);
const T = (r, text, i) => ({ role: r, text, ts: Date.now() + i * 4000 });
const lines = [
  T("agent","שלום, אני דנה. ספרו לי קצת על מי שיגור בבית ומה אתם מחפשים.",0),
  T("user","אנחנו זוג עם שני ילדים, מחפשים דירת 4 חדרים בתל אביב, באזור הצפון הישן או הירקון.",1),
  T("agent","מה התקציב שלכם, והאם יש הון עצמי?",2),
  T("user","התקציב הוא עד 3.5 מיליון שקל, יש לנו הון עצמי של כ-1.2 מיליון.",3),
  T("agent","מה הכי חשוב לכם בדירה?",4),
  T("user","מרפסת שמש, קומה גבוהה, שקט, קרוב לגן ילדים. חשוב לנו אור טבעי ואפשרות לחניה.",5),
  T("agent","האם יש משהו שלא מתאים לכם?",6),
  T("user","לא רוצים קומת קרקע ולא רחוב סואן. מוכנים לחכות לפרויקט חדש שיסתיים עוד שנתיים.",7),
];
const r = await p.evaluate(async (lines) => {
  const token = localStorage.getItem("token");
  const res = await fetch("/api/transcript", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body: JSON.stringify({ lines }) });
  const j = await res.json().catch(()=>({})); if (j.transcriptId) localStorage.setItem("transcriptId", j.transcriptId);
  return { status: res.status, ok: res.ok, hasId: !!j.transcriptId, err: j.error };
}, lines);
console.log("transcript:", r);
if (r.ok) {
  await p.goto("http://localhost:3001/processing", { waitUntil: "load" });
  await p.waitForURL("**/results", { timeout: 150000 }).catch(()=>console.log("no redirect to /results; at", p.url()));
  console.log("final url", p.url(), Math.round((Date.now()-t0)/1000)+"s");
  await p.waitForTimeout(2500);
  const mr = await p.evaluate(() => sessionStorage.getItem("matchResults"));
  if (process.env.MATCH_OUT && mr) { (await import("node:fs")).writeFileSync(process.env.MATCH_OUT, mr); console.log("saved matchResults bytes", mr.length); }
  await p.screenshot({ path: new URL("./shots/r-results-live.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), fullPage: true });
  await ctx.storageState({ path: process.env.STATE });
}
await b.close();
