"use client";
/**
 * Catalog admin UI (M11). Lists every catalog entry with its status, runs the publish gates on drafts,
 * publishes checked drafts and retires published entries (each creates a numbered release), imports a
 * manifest with its files, and shows the release history. All rules live on the server
 * (lib/studio/catalog/registry.ts + gates.ts); this page only calls /api/studio/admin/catalog.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { modelAssetUrl } from "@/lib/studio/catalog/assets";
import type { Entry, Release } from "@/lib/studio/catalog/registry";
import { useT } from "../useT";
import "./catalog-admin.css";

type ReleaseMeta = Pick<Release, "release" | "publishedAt" | "by" | "changes" | "note">;
type Data = { head: number; entries: Entry[]; releases: ReleaseMeta[] };
type Msg = { kind: "ok" | "err"; text: string; issues?: string[] } | null;

const API = "/api/studio/admin/catalog";

export default function CatalogAdmin() {
  const { t, locale } = useT();
  const he = locale === "he";
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<"all" | Entry["status"]>("all");
  const [type, setType] = useState<"all" | Entry["type"]>("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [manifest, setManifest] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(API, { cache: "no-store" });
    if (r.ok) setData(await r.json());
    else setMsg({ kind: "err", text: t("adm.loadFailed") });
  }, [t]);
  useEffect(() => {
    let alive = true;
    fetch(API, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Data) => { if (alive) setData(j); })
      .catch(() => { if (alive) setMsg({ kind: "err", text: t("adm.loadFailed") }); });
    return () => { alive = false; };
  }, [t]);

  const run = async (body: Record<string, unknown> | FormData, okText: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(API, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: "err", text: j.error ?? t("adm.failed"), issues: j.issues });
      else {
        const failed = (j.entries as Entry[] | undefined)?.filter((e) => e.issues?.length) ?? [];
        setMsg(failed.length ? { kind: "err", text: t("adm.checkFailed").replace("{n}", String(failed.length)), issues: failed.flatMap((e) => e.issues!.map((i) => `${e.key}: ${i}`)) }
          : { kind: "ok", text: j.release ? `${okText} · ${t("adm.release")} ${j.release.release}` : okText });
        setSel(new Set());
      }
      await load();
      return r.ok;
    } finally { setBusy(false); }
  };

  const entries = useMemo(() => (data?.entries ?? []).filter((e) =>
    (status === "all" || e.status === status) && (type === "all" || e.type === type)
    && (!query || `${e.key} ${e.manifest.name.en} ${e.manifest.name.he}`.toLowerCase().includes(query.toLowerCase()))), [data, status, type, query]);
  const counts = useMemo(() => {
    const c = { draft: 0, published: 0, retired: 0, models: 0, materials: 0 };
    for (const e of data?.entries ?? []) {
      c[e.status]++;
      if (e.status === "published") c[e.type === "model" ? "models" : "materials"]++;
    }
    return c;
  }, [data]);
  const chosen = (data?.entries ?? []).filter((e) => sel.has(e.key));
  const drafts = chosen.filter((e) => e.status === "draft").map((e) => e.key);
  const published = chosen.filter((e) => e.status === "published").map((e) => e.key);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openEntry = data?.entries.find((e) => e.key === open) ?? null;

  const importDraft = async () => {
    const fd = new FormData();
    fd.set("manifest", manifest);
    for (const f of Array.from(files ?? [])) fd.append("files", f);
    if (await run(fd, t("adm.imported"))) { setManifest(""); setFiles(null); }
  };

  return (
    <main className="ca" dir={he ? "rtl" : "ltr"}>
      <header className="ca-head">
        <div>
          <h1>{t("adm.title")}</h1>
          <p className="ca-sub">
            {t("adm.release")} <strong data-testid="head">{data?.head ?? "…"}</strong>
            {" · "}{counts.models} {t("adm.models")} · {counts.materials} {t("adm.materials")}
            {counts.draft > 0 && <> · {counts.draft} {t("adm.drafts")}</>}
            {counts.retired > 0 && <> · {counts.retired} {t("adm.retiredN")}</>}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => run({ action: "sync" }, t("adm.synced"))}>{t("adm.sync")}</button>
      </header>

      {msg && (
        <div className={`ca-msg ca-msg--${msg.kind}`} role={msg.kind === "err" ? "alert" : "status"}>
          <p>{msg.text}</p>
          {!!msg.issues?.length && <ul>{msg.issues.slice(0, 30).map((i) => <li key={i} dir="ltr">{i}</li>)}</ul>}
        </div>
      )}

      <section className="ca-grid">
        <div className="ca-list">
          <div className="ca-filters">
            <input type="search" value={query} placeholder={t("adm.search")} aria-label={t("adm.search")} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label={t("adm.status")} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">{t("adm.allStatus")}</option>
              <option value="draft">{t("adm.st.draft")}</option>
              <option value="published">{t("adm.st.published")}</option>
              <option value="retired">{t("adm.st.retired")}</option>
            </select>
            <select aria-label={t("adm.type")} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="all">{t("adm.allTypes")}</option>
              <option value="model">{t("adm.models")}</option>
              <option value="material">{t("adm.materials")}</option>
            </select>
          </div>

          <div className="ca-actions">
            <input value={note} maxLength={280} placeholder={t("adm.note")} aria-label={t("adm.note")} onChange={(e) => setNote(e.target.value)} />
            <button type="button" data-action="check" disabled={busy || !drafts.length} onClick={() => run({ action: "check", keys: drafts }, t("adm.checked"))}>{t("adm.check")} ({drafts.length})</button>
            <button type="button" data-action="publish" className="ca-primary" disabled={busy || !drafts.length} onClick={() => run({ action: "publish", keys: drafts, note }, t("adm.published"))}>{t("adm.publish")} ({drafts.length})</button>
            <button type="button" data-action="retire" disabled={busy || !published.length} onClick={() => { if (window.confirm(t("adm.retireConfirm"))) void run({ action: "retire", keys: published, note }, t("adm.retiredOk")); }}>{t("adm.retire")} ({published.length})</button>
            <button type="button" data-action="discard" className="ca-danger" disabled={busy || !drafts.length} onClick={() => run({ action: "discard", keys: drafts }, t("adm.discarded"))}>{t("adm.discard")}</button>
          </div>

          <table className="ca-table">
            <thead>
              <tr><th aria-label={t("adm.select")} /><th>{t("adm.name")}</th><th>{t("adm.key")}</th><th>{t("adm.status")}</th><th>{t("adm.license")}</th><th>{t("adm.gates")}</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.key} data-key={e.key} data-status={e.status} aria-selected={open === e.key} onClick={() => setOpen(e.key)}>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    {e.status !== "retired" && <input type="checkbox" aria-label={e.key} checked={sel.has(e.key)} onChange={() => toggle(e.key)} />}
                  </td>
                  <td>{e.manifest.name[locale]}</td>
                  <td dir="ltr" className="ca-mono">{e.key}</td>
                  <td><span className={`ca-chip ca-chip--${e.status}`}>{t(`adm.st.${e.status}`)}</span></td>
                  <td dir="ltr" className="ca-mono">{e.manifest.license.spdx}</td>
                  <td>{e.issues === null ? <span className="ca-dim">{t("adm.notChecked")}</span> : e.issues.length ? <span className="ca-bad">✗ {e.issues.length}</span> : <span className="ca-good">✓</span>}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={6} className="ca-dim">{data ? t("adm.empty") : t("adm.loading")}</td></tr>}
            </tbody>
          </table>
        </div>

        <aside className="ca-side">
          {openEntry ? (
            <div className="ca-card">
              <header><strong>{openEntry.manifest.name[locale]}</strong><button type="button" aria-label={t("close")} onClick={() => setOpen(null)}>✕</button></header>
              {openEntry.manifest.type === "model" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ca-preview" src={modelAssetUrl(openEntry.manifest.assets.preview)} alt="" />
              )}
              <dl>
                <dt>{t("adm.key")}</dt><dd dir="ltr" className="ca-mono">{openEntry.key}</dd>
                <dt>{t("adm.status")}</dt><dd>{t(`adm.st.${openEntry.status}`)}{openEntry.publishedIn ? ` · ${t("adm.release")} ${openEntry.publishedIn}` : ""}{openEntry.retiredIn ? ` → ${openEntry.retiredIn}` : ""}</dd>
                <dt>{t("adm.license")}</dt><dd dir="ltr">{openEntry.manifest.license.spdx} · {openEntry.manifest.license.author}{openEntry.manifest.license.attributionText ? ` · ${openEntry.manifest.license.attributionText}` : ""}</dd>
                <dt>{t("adm.by")}</dt><dd dir="ltr">{openEntry.by} · {new Date(openEntry.updatedAt).toLocaleString(locale === "he" ? "he-IL" : "en-GB")}</dd>
              </dl>
              {!!openEntry.issues?.length && <ul className="ca-issues">{openEntry.issues.map((i) => <li key={i} dir="ltr">{i}</li>)}</ul>}
              <details><summary>{t("adm.manifest")}</summary><pre dir="ltr">{JSON.stringify(openEntry.manifest, null, 2)}</pre></details>
            </div>
          ) : (
            <div className="ca-card">
              <header><strong>{t("adm.import")}</strong></header>
              <p className="ca-dim">{t("adm.importHelp")}</p>
              <textarea dir="ltr" rows={10} value={manifest} placeholder='{ "type": "model", "id": "…", "version": 1, … }' aria-label={t("adm.manifest")} onChange={(e) => setManifest(e.target.value)} />
              <input type="file" multiple accept=".glb,.webp,.png,.jpg,.jpeg,.ktx2" aria-label={t("adm.files")} onChange={(e) => setFiles(e.target.files)} />
              <button type="button" className="ca-primary" data-action="import" disabled={busy || !manifest.trim()} onClick={importDraft}>{t("adm.importBtn")}</button>
            </div>
          )}

          <div className="ca-card">
            <header><strong>{t("adm.releases")}</strong></header>
            <ol className="ca-releases" reversed>
              {(data?.releases ?? []).map((r) => (
                <li key={r.release} data-release={r.release}>
                  <div><strong>{t("adm.release")} {r.release}</strong> <span className="ca-dim">{new Date(r.publishedAt).toLocaleString(locale === "he" ? "he-IL" : "en-GB")} · <span dir="ltr">{r.by}</span></span></div>
                  {r.note && <div className="ca-dim">{r.note}</div>}
                  {r.changes.added.length > 0 && <div className="ca-good">＋ {r.changes.added.length} {t("adm.added")}</div>}
                  {r.changes.retired.length > 0 && <div className="ca-bad">− <span dir="ltr">{r.changes.retired.join(", ")}</span></div>}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
