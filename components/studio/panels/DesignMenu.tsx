"use client";

/**
 * Secondary "More" menu: design name, named versions (save / restore),
 * duplicate and share links. Kept out of the main flow on purpose: saving
 * itself is automatic and invisible.
 */
import { useCallback, useState } from "react";
import type { ShareMeta, VersionMeta } from "@/lib/studio/persist/types";
import { useStudio } from "../store";
import { useT } from "../useT";
import { designsApi } from "../persist/api";
import { loadRecord } from "../persist/usePersistence";

export default function DesignMenu() {
  const { t } = useT();
  const design = useStudio((s) => s.design);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [shares, setShares] = useState<ShareMeta[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const owner = design?.mode === "owner" && !!design.id;

  const refresh = useCallback(async () => {
    const d = useStudio.getState().design;
    if (!d?.id || d.mode !== "owner") return;
    const [v, s] = await Promise.all([designsApi.versions(d.id), designsApi.shares(d.id)]);
    setVersions(v.versions); setShares(s.shares.filter((x) => !x.revokedAt));
  }, []);

  if (!owner || !design) return null;

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(null), 2500); };
  /** Waits until the server has the latest edits, so versions and shares capture what is on screen. */
  async function synced() {
    for (let i = 0; i < 30; i++) {
      const s = useStudio.getState();
      if (s.design?.status === "saved" || s.design?.status === "local") return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function saveVersion() {
    const label = window.prompt(t("versionName"));
    if (!label?.trim()) return;
    await synced();
    await designsApi.addVersion(design!.id, label.trim());
    await refresh();
  }
  async function restore(v: VersionMeta) {
    await synced();
    const cur = useStudio.getState().design!;
    const { design: rec } = await designsApi.restore(cur.id, v.id, cur.revision);
    loadRecord(rec, "owner");
    setOpen(false);
  }
  async function duplicate() {
    await synced();
    const { design: rec } = await designsApi.duplicate(design!.id);
    loadRecord(rec, "owner");
    setOpen(false);
  }
  async function share(permission: "view" | "edit") {
    await synced();
    const { token } = await designsApi.createShare(design!.id, permission);
    const link = `${window.location.origin}/studio/shared/${token}`;
    try { await navigator.clipboard.writeText(link); say(t("copied")); } catch { window.prompt(t("copyLink"), link); }
    await refresh();
  }

  return (
    <>
      <button type="button" className="st-iconbtn st-more" aria-label={t("more")} aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) { setName(design.name); void refresh().catch(() => undefined); } }}>⋯</button>
      {open && (
        <aside className="st-ui st-panel st-menu" aria-label={t("more")}>
          <header className="st-panel__head">
            <strong>{t("more")}</strong>
            <button type="button" className="st-iconbtn" aria-label={t("close")} onClick={() => setOpen(false)}>✕</button>
          </header>
          <label className="st-menu__label">{t("designName")}</label>
          <input className="st-search" value={name} onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== design.name) void designsApi.rename(design.id, name).then((r) => useStudio.getState().setDesign({ name: r.design.name })); }} />

          <h4>{t("versions")}</h4>
          <button type="button" className="st-chip" onClick={() => void saveVersion()}>＋ {t("saveVersion")}</button>
          <ul className="st-list">
            {versions.length === 0 && <li className="st-empty">{t("noVersions")}</li>}
            {versions.map((v) => (
              <li key={v.id}><span>{v.label}<small>{new Date(v.createdAt).toLocaleString()}</small></span>
                <button type="button" className="st-link" onClick={() => void restore(v)}>{t("restoreVersion")}</button></li>
            ))}
          </ul>

          <h4>{t("share")}</h4>
          <div className="st-chips">
            <button type="button" className="st-chip" onClick={() => void share("view")}>{t("shareView")}</button>
            <button type="button" className="st-chip" onClick={() => void share("edit")}>{t("shareEdit")}</button>
          </div>
          {shares.length > 0 && <h4>{t("yourLinks")}</h4>}
          <ul className="st-list">
            {shares.map((s) => (
              <li key={s.id}><span>{s.permission === "edit" ? t("shareEdit") : t("shareView")}<small>{new Date(s.createdAt).toLocaleDateString()}</small></span>
                <button type="button" className="st-link" onClick={() => void designsApi.revokeShare(design.id, s.id).then(refresh)}>{t("revoke")}</button></li>
            ))}
          </ul>

          <h4>{t("duplicateDesign")}</h4>
          <button type="button" className="st-chip" onClick={() => void duplicate()}>{t("duplicate")}</button>
          {note && <p className="st-ok">{note}</p>}
        </aside>
      )}
    </>
  );
}
