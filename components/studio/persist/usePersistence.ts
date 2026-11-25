"use client";

/**
 * Loads the person's design for this apartment (or the shared one), then
 * autosaves silently: edits are debounced, sent with the revision they were
 * based on (a 409 means "changed elsewhere", never an overwrite), and mirrored
 * to a local draft so nothing is lost offline or when the tab closes.
 */
import { useEffect } from "react";
import { migrateDocument } from "@/lib/studio/migrations";
import type { DesignRecord } from "@/lib/studio/persist/types";
import type { DesignDocument } from "@/lib/studio/schema/document";
import { useStudio, type DesignState } from "../store";
import { ApiError, designsApi, sharedApi } from "./api";
import { clearDraft, draftKey, readDraft, writeDraft } from "./draft";

/** The document the server already has (loaded or last saved): changes are measured against it. */
export const persistState: { lastSaved: DesignDocument | null } = { lastSaved: null };

type Rec = Omit<DesignRecord, "ownerId"> & { ownerId?: string };

/** Puts a server record into the studio as the current design. */
export function loadRecord(rec: Rec, mode: DesignState["mode"], token?: string) {
  const doc = migrateDocument(rec.data);
  persistState.lastSaved = doc;
  useStudio.getState().replaceDocument(doc, { id: rec.id, name: rec.name, revision: rec.revision, mode, token, status: "saved" });
}

const SAVE_DELAY = 1500;
const DRAFT_DELAY = 250;

export function usePersistence(opts: { baselineId: string; sharedToken?: string }) {
  const ready = useStudio((s) => s.ready);
  const { baselineId, sharedToken } = opts;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let draftTimer: ReturnType<typeof setTimeout> | undefined;
    let saving = false;
    const st = () => useStudio.getState();

    async function flush(keepalive = false) {
      const { design: d, doc } = st();
      if (saving || !d || !d.id || !doc || d.status === "conflict" || d.mode === "shared-view" || doc === persistState.lastSaved) return;
      saving = true;
      st().setDesign({ status: "saving" });
      try {
        const res = d.token ? await sharedApi.save(d.token, doc, d.revision, keepalive) : await designsApi.save(d.id, doc, d.revision, keepalive);
        persistState.lastSaved = doc;
        st().setDesign({ revision: res.design.revision, status: "saved" });
        if (st().doc === doc) void clearDraft(draftKey(d.id, d.token));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) st().setDesign({ status: "conflict" });
        else if (e instanceof ApiError && (e.status === 401 || e.status === 404)) st().setDesign({ status: "local" });
        else st().setDesign({ status: "offline" }); // network down: the draft keeps the edits
      } finally {
        saving = false;
        if (!cancelled && st().doc !== persistState.lastSaved && st().design?.status === "saved") schedule();
      }
    }
    function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(() => void flush(), SAVE_DELAY); }

    const unsub = useStudio.subscribe((s, prev) => {
      if (s.doc === prev.doc || !s.doc || !s.design || !s.design.id || s.design.mode === "shared-view" || s.doc === persistState.lastSaved) return;
      const doc = s.doc, d = s.design;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => void writeDraft({ key: draftKey(d.id, d.token), doc, baseRevision: d.revision, savedAt: Date.now() }), DRAFT_DELAY);
      if (d.status !== "conflict") schedule();
    });

    const onHide = () => { if (document.visibilityState === "hidden") void flush(true); };
    const onOnline = () => { if (st().design?.status === "offline") void flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide as () => void);
    window.addEventListener("online", onOnline);
    const retryTimer = setInterval(() => { if (st().design?.status === "offline") void flush(); }, 15000);

    (async () => {
      try {
        if (sharedToken) {
          const { design, permission } = await sharedApi.get(sharedToken);
          if (cancelled) return;
          loadRecord(design, permission === "edit" ? "shared-edit" : "shared-view", sharedToken);
        } else {
          const { designs } = await designsApi.list(baselineId);
          let rec: DesignRecord;
          if (designs.length) rec = (await designsApi.get(designs[0].id)).design;
          else rec = (await designsApi.create(st().doc!)).design;
          if (cancelled) return;
          loadRecord(rec, "owner");
        }
        // unsaved local edits from a previous visit (same base revision) are applied and saved
        const d = st().design;
        if (d && d.mode !== "shared-view") {
          const draft = await readDraft(draftKey(d.id, d.token));
          if (!cancelled && draft && draft.baseRevision === d.revision && JSON.stringify(draft.doc) !== JSON.stringify(st().doc)) {
            useStudio.getState().replaceDocument(draft.doc, d);
            schedule();
          }
        }
      } catch (e) {
        if (cancelled) return;
        // not signed in / feature off for this user / offline: the studio still works, locally
        if (!st().design) useStudio.setState({ design: { id: "", name: "", revision: 0, mode: "owner", status: e instanceof ApiError ? "local" : "offline" } });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(saveTimer); clearTimeout(draftTimer); clearInterval(retryTimer);
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide as () => void);
      window.removeEventListener("online", onOnline);
    };
  }, [ready, baselineId, sharedToken]);
}

/** Discards local changes and reloads the server's version (used after a conflict). */
export async function reloadFromServer() {
  const d = useStudio.getState().design;
  if (!d || !d.id) return;
  if (d.token) { const r = await sharedApi.get(d.token); loadRecord(r.design, r.permission === "edit" ? "shared-edit" : "shared-view", d.token); }
  else loadRecord((await designsApi.get(d.id)).design, "owner");
  void clearDraft(draftKey(d.id, d.token));
}
