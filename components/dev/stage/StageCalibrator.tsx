"use client";

/**
 * Developer tool: upload the building image and mark, on top of it, where each
 * building is, where its floors are and where the apartments sit. The result
 * (lib/stage.ts) is what the buyer's "choose a floor" screen runs on.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import type { PhotoBox, PhotoMeta } from "@/lib/experience/types";
import { PlacementGrid, type GridType, type GridUnit } from "./PlacementGrid";
import type { CellEdit } from "@/lib/placement";
import { evenBands, evenSlots, validateStage, type StageBuilding } from "@/lib/stage";

type Lang = "he" | "en";
const T = {
  title: { he: "תמונת הבניין", en: "Building image" },
  intro: {
    he: "העלו הדמיה של הבניין (חזית, יום). אחר כך גררו את המסגרת כך שתכסה את הבניין מהגג עד הקרקע. קווי הקומות והדירות יסתדרו בתוכה.",
    en: "Upload a rendering of the building (facade, daytime). Then drag the frame so it covers the building from roof to ground. Floor lines and apartments fit inside it.",
  },
  upload: { he: "העלאת תמונה", en: "Upload image" },
  replace: { he: "החלפת תמונה", en: "Replace image" },
  replaceWarn: { he: "להחליף את התמונה? אם הגודל זהה הסימון נשמר, אחרת הוא מתאפס.", en: "Replace the image? The marking is kept if the size is the same, otherwise it resets." },
  litImage: { he: "תמונת לילה (אורות דולקים)", en: "Night image (lights on)" },
  litHelp: { he: "כל הדירות מוארות. כשהקונה עובר עם העכבר על קומה, היא נדלקת מתוך התמונה הזו.", en: "Every apartment lit. When a buyer hovers a floor, it lights up from this image." },
  offImage: { he: "תמונת יום (אורות כבויים)", en: "Day image (lights off)" },
  offHelp: { he: "תצוגת הפתיחה של הבניין. אותו גודל בדיוק כמו תמונת הלילה.", en: "The opening view of the building. Exactly the same size as the night image." },
  offFirst: { he: "קודם מעלים את תמונת הלילה", en: "Upload the night image first" },
  needDay: { he: "בלי תמונת יום, קומה לא נדלקת במעבר עכבר: התמונה רק מתעממת. העלו גם תמונת יום באותו גודל.", en: "Without the day image a floor does not light up on hover: the picture just dims. Upload the day image too, same size." },
  showNight: { he: "מציג: לילה", en: "Showing: night" },
  showDay: { he: "מציג: יום", en: "Showing: day" },
  buyerView: { he: "תצוגה לקונה", en: "Buyer view" },
  uploading: { he: "מעלה…", en: "Uploading…" },
  save: { he: "שמירת הסימון", en: "Save marking" },
  saving: { he: "שומר…", en: "Saving…" },
  saved: { he: "הסימון נשמר", en: "Marking saved" },
  unsaved: { he: "יש שינויים שלא נשמרו", en: "Unsaved changes" },
  floors: { he: "קומות", en: "floors" },
  apts: { he: "דירות בקומה", en: "apartments per floor" },
  evenLines: { he: "פיזור קווי קומות שווה", en: "Space floor lines evenly" },
  hint: {
    he: "גררו את המסגרת להזזה, את הפינות לשינוי גודל, ואת קווי הקומות לכוונון (למשל קומת כניסה גבוהה).",
    en: "Drag the frame to move it, the corners to resize, and the floor lines to adjust (for example a tall lobby).",
  },
  noBuilding: { he: "הפרויקט עדיין בלי בניין. הוסיפו בניין בדף הפרויקט.", en: "This project has no building yet. Add one on the project page." },
  noImage: { he: "עוד לא הועלתה תמונה.", en: "No image uploaded yet." },
  preview: { he: "תצוגה לקונה", en: "Buyer view" },
  back: { he: "← חזרה ללוח הבקרה", en: "← Back to dashboard" },
  addBuilding: { he: "+ הוספת בניין", en: "+ Add building" },
  buildingName: { he: "שם הבניין", en: "Building name" },
  floorCount: { he: "מספר קומות", en: "Floors" },
  unitsPerFloor: { he: "דירות בקומה", en: "Apartments per floor" },
  create: { he: "יצירת הבניין", en: "Create building" },
  creating: { he: "יוצר…", en: "Creating…" },
  needBuilding: { he: "קודם מוסיפים את הבניין (שם, קומות, דירות בקומה), ואחר כך מעלים את ההדמיה.", en: "First add the building (name, floors, apartments per floor), then upload the rendering." },
  wrongType: { he: "יש להעלות תמונת WebP, JPEG או PNG", en: "Use a WebP, JPEG or PNG image" },
} satisfies Record<string, Record<Lang, string>>;

const COLORS = ["#c2410c", "#0f766e", "#7c3aed", "#b45309"];
type Mode = "move" | "nw" | "ne" | "sw" | "se" | { band: number };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const MIN = 0.04;

export function StageCalibrator({ projectId }: { projectId: string }) {
  const { locale } = useI18n();
  const lang: Lang = locale === "en" ? "en" : "he";
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<PhotoMeta | null>(null);
  const [buildings, setBuildings] = useState<StageBuilding[]>([]);
  const [units, setUnits] = useState<GridUnit[]>([]);
  const [types, setTypes] = useState<GridType[]>([]);
  const [sel, setSel] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [rev, setRev] = useState(0);
  const [offUrl, setOffUrl] = useState<string | null>(null);
  const [showDay, setShowDay] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [nb, setNb] = useState({ name: "", floors: "10", units: "4" });
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; start: [number, number]; box: PhotoBox } | null>(null);

  const call = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = localStorage.getItem("token") ?? "";
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    if (res.status === 401) { router.push("/dev/login"); throw new Error("Unauthorized"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((lang === "he" ? body.errorHe : body.error) ?? body.error ?? `HTTP ${res.status}`);
    return body;
  }, [router, lang]);

  useEffect(() => {
    let live = true;
    call(`/api/dev/projects/${projectId}/stage`)
      .then((b) => { if (!live) return; setImageUrl(b.imageUrl); setMeta(b.meta); setBuildings(b.buildings); setUnits(b.units ?? []); setTypes(b.unitTypes ?? []); setOffUrl(b.offImageUrl ?? null); })
      .catch((e: Error) => { if (live) setMsg({ kind: "error", text: e.message }); });
    return () => { live = false; };
  }, [call, projectId]);

  const update = (i: number, fn: (b: PhotoBox) => PhotoBox) => {
    setMeta((m) => (m ? { ...m, buildings: m.buildings.map((b, k) => (k === i ? fn(b) : b)) } : m));
    setDirty(true);
    setMsg(null);
  };

  /** Re-map the floor lines when the frame moves or resizes, keeping their relative positions. */
  const reframe = (b: PhotoBox, nb: { x: number; y: number; w: number; h: number }): PhotoBox => ({
    ...b, ...nb,
    ...(b.bands ? { bands: b.bands.map((v) => nb.y + ((v - b.y) / b.h) * nb.h) } : {}),
  });

  const onDown = (e: React.PointerEvent, mode: Mode) => {
    if (!meta) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, start: [e.clientX, e.clientY], box: meta.buildings[sel] };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, el = stage.current;
    if (!d || !el || !meta) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - d.start[0]) / r.width, dy = (e.clientY - d.start[1]) / r.height;
    const b = d.box;
    if (typeof d.mode === "object") {
      const bands = b.bands ?? evenBands(b, buildings[sel].floorCount), k = d.mode.band;
      const lo = k === 0 ? b.y : bands[k - 1] + 0.004, hi = k === bands.length - 1 ? b.y + b.h : bands[k + 1] - 0.004;
      update(sel, (cur) => ({ ...cur, bands: bands.map((v, i) => (i === k ? clamp(v + dy, lo, hi) : v)) }));
      return;
    }
    let { x, y, w, h } = b;
    if (d.mode === "move") { x = clamp(b.x + dx, 0, 1 - b.w); y = clamp(b.y + dy, 0, 1 - b.h); }
    else {
      if (d.mode.includes("w")) { const nx = clamp(b.x + dx, 0, b.x + b.w - MIN); w = b.x + b.w - nx; x = nx; }
      if (d.mode.includes("e")) w = clamp(b.w + dx, MIN, 1 - b.x);
      if (d.mode.includes("n")) { const ny = clamp(b.y + dy, 0, b.y + b.h - MIN); h = b.y + b.h - ny; y = ny; }
      if (d.mode.includes("s")) h = clamp(b.h + dy, MIN, 1 - b.y);
    }
    update(sel, () => reframe(b, { x, y, w, h }));
  };
  const onUp = () => { drag.current = null; };

  const upload = async (file: File, kind: "on" | "off") => {
    const has = kind === "on" ? !!imageUrl : !!offUrl;
    if (has && !window.confirm(T.replaceWarn[lang])) return;
    setBusy("upload"); setMsg(null);
    try {
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); res({ w: img.naturalWidth, h: img.naturalHeight }); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(T.wrongType[lang])); };
        img.src = url;
      });
      const fd = new FormData();
      fd.append("file", file); fd.append("aspect", String(dims.w / dims.h)); fd.append("kind", kind);
      const b = await call(`/api/dev/projects/${projectId}/stage`, { method: "POST", body: fd });
      setImageUrl(b.imageUrl); setOffUrl(b.offImageUrl ?? null); setMeta(b.meta); setBuildings(b.buildings); if (kind === "on" && !b.kept) setSel(0); setDirty(false); setRev((r) => r + 1);
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const createBuilding = async () => {
    setBusy("save"); setMsg(null);
    try {
      await call(`/api/dev/projects/${projectId}/buildings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nb.name.trim(), floorCount: Number(nb.floors), unitsPerFloor: Number(nb.units) }),
      });
      const b = await call(`/api/dev/projects/${projectId}/stage`);
      setImageUrl(b.imageUrl); setMeta(b.meta); setBuildings(b.buildings); setUnits(b.units ?? []); setTypes(b.unitTypes ?? []); setSel(b.buildings.length - 1);
      setAddOpen(false); setNb({ name: "", floors: nb.floors, units: nb.units }); setDirty(false);
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const place = async (cells: CellEdit[]) => {
    const target = buildings[sel];
    if (!target) return;
    setBusy("save"); setMsg(null);
    try {
      const r = await call(`/api/dev/buildings/${target.id}/units`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cells }) });
      setUnits((prev) => [...prev.filter((u) => u.buildingId !== target.id), ...r.units.map((u: Omit<GridUnit, "buildingId">) => ({ ...u, buildingId: target.id }))]);
      return { blocked: (r.blocked ?? []).length as number };
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const issues = meta ? validateStage(meta, buildings) : [];
  const save = async () => {
    if (!meta) return;
    setBusy("save"); setMsg(null);
    try {
      const b = await call(`/api/dev/projects/${projectId}/stage`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buildings: meta.buildings }) });
      setMeta(b.meta); setDirty(false); setMsg({ kind: "ok", text: T.saved[lang] });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const card: React.CSSProperties = { background: "var(--qp-surface)", border: "1px solid var(--qp-border)", borderRadius: "0.75rem", padding: "1.25rem" };
  const btn: React.CSSProperties = { padding: "0.5rem 1rem", borderRadius: "0.4rem", fontSize: "0.875rem", fontWeight: 600, border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)", cursor: "pointer" };
  const box = meta?.buildings[sel];
  const b = buildings[sel];
  const bands = box && b ? box.bands ?? evenBands(box, b.floorCount) : [];
  const slots = box && b ? box.slots ?? evenSlots(b.unitsPerFloor) : [];
  const color = COLORS[sel % COLORS.length];
  const groundRow = bands.length > 1 && box ? ((bands[bands.length - 2] - box.y) / box.h + (bands[bands.length - 1] - bands[bands.length - 2]) / box.h / 2) * 100 : 50;

  return (
    <div dir={lang === "he" ? "rtl" : "ltr"} style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 1.25rem 3rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <button type="button" onClick={() => router.push("/dev/dashboard")} style={{ ...btn, alignSelf: "flex-start", border: "none", background: "none" }}>{T.back[lang]}</button>
      <h1 style={{ margin: 0, fontSize: "1.5rem", color: "var(--qp-ink)" }}>{T.title[lang]}</h1>
      <p style={{ margin: 0, color: "var(--qp-muted)", fontSize: "0.9375rem" }}>{T.intro[lang]}</p>

      <div style={{ ...card, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {buildings.length === 0 || addOpen ? null : <button type="button" style={btn} onClick={() => setAddOpen(true)}>{T.addBuilding[lang]}</button>}
          {buildings.length > 0 && (["on", "off"] as const).map((k) => {
            const has = k === "on" ? !!imageUrl : !!offUrl;
            const off = k === "off" && !imageUrl;
            return (
              <label key={k} title={off ? T.offFirst[lang] : (k === "on" ? T.litHelp : T.offHelp)[lang]} style={{ ...btn, opacity: busy || off ? 0.55 : 1, cursor: off ? "not-allowed" : "pointer", display: "inline-flex", flexDirection: "column", gap: 2 }}>
                <span>{has ? "✓ " : ""}{(k === "on" ? T.litImage : T.offImage)[lang]}</span>
                <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--qp-muted)" }}>{busy === "upload" ? T.uploading[lang] : has ? T.replace[lang] : T.upload[lang]}</span>
                <input type="file" accept="image/webp,image/jpeg,image/png" hidden disabled={!!busy || off} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f, k); }} />
              </label>
            );
          })}
          {buildings.length > 1 && buildings.map((x, i) => (
            <button key={x.id} type="button" onClick={() => setSel(i)} style={{ ...btn, borderColor: COLORS[i % COLORS.length], background: i === sel ? COLORS[i % COLORS.length] : "var(--qp-surface)", color: i === sel ? "var(--c-on-btn,#fff)" : "var(--qp-ink)" }}>{x.name}</button>
          ))}
          {b && <span style={{ color: "var(--qp-muted)", fontSize: "0.8125rem" }}>{b.floorCount} {T.floors[lang]} · {b.unitsPerFloor} {T.apts[lang]}</span>}
          <span style={{ marginInlineStart: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {dirty && <span style={{ fontSize: "0.8125rem", color: "var(--qp-warning)" }}>{T.unsaved[lang]}</span>}
            {box && b && <button type="button" style={btn} onClick={() => update(sel, (cur) => ({ ...cur, bands: evenBands(cur, b.floorCount) }))}>{T.evenLines[lang]}</button>}
            <button type="button" disabled={!dirty || !!busy || issues.length > 0} onClick={save} style={{ ...btn, background: "var(--qp-accent)", color: "var(--c-on-btn,#fff)", border: "none", opacity: !dirty || busy || issues.length ? 0.5 : 1 }}>
              {busy === "save" ? T.saving[lang] : T.save[lang]}
            </button>
          </span>
        </div>

        {(buildings.length === 0 || addOpen) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            {buildings.length === 0 && <p style={{ margin: 0, width: "100%", color: "var(--qp-muted)", fontSize: "0.875rem" }}>{T.needBuilding[lang]}</p>}
            {([["name", T.buildingName, "text"], ["floors", T.floorCount, "number"], ["units", T.unitsPerFloor, "number"]] as const).map(([k, label, type]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.8125rem", color: "var(--qp-muted)" }}>
                {label[lang]}
                <input
                  type={type} value={nb[k]} min={type === "number" ? 1 : undefined} max={type === "number" ? (k === "floors" ? 120 : 12) : undefined}
                  onChange={(e) => setNb((v) => ({ ...v, [k]: e.target.value }))}
                  style={{ padding: "0.45rem 0.6rem", borderRadius: "0.4rem", border: "1px solid var(--qp-border)", background: "var(--qp-bg, var(--c-card,#fff))", color: "var(--qp-ink)", width: k === "name" ? 180 : 100 }}
                />
              </label>
            ))}
            <button type="button" disabled={!!busy || !nb.name.trim()} onClick={createBuilding} style={{ ...btn, background: "var(--qp-accent)", color: "var(--c-on-btn,#fff)", border: "none", opacity: busy || !nb.name.trim() ? 0.5 : 1 }}>
              {busy ? T.creating[lang] : T.create[lang]}
            </button>
            {addOpen && buildings.length > 0 && <button type="button" style={btn} onClick={() => setAddOpen(false)}>✕</button>}
          </div>
        )}

        {meta && imageUrl ? (
          <>
            <p style={{ margin: 0, color: "var(--qp-muted)", fontSize: "0.8125rem" }}>{T.hint[lang]}</p>
            {!offUrl && <div role="status" style={{ fontSize: "0.8125rem", color: "var(--qp-warning)" }}>{T.needDay[lang]}</div>}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {offUrl && <button type="button" style={btn} onClick={() => setShowDay((v) => !v)}>{showDay ? T.showDay[lang] : T.showNight[lang]}</button>}
              {types[0] && !dirty && <a href={`/aom/${types[0].id}`} target="_blank" rel="noopener" style={{ ...btn, textDecoration: "none" }}>{T.buyerView[lang]} ↗</a>}
            </div>
            <div
              ref={stage} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ position: "relative", width: "100%", aspectRatio: String(meta.aspect), touchAction: "none", userSelect: "none", borderRadius: "0.5rem", overflow: "hidden", background: "#111" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored upload, not a static asset */}
              <img src={`${showDay && offUrl ? offUrl : imageUrl}?v=${rev}`} alt="" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />
              {meta.buildings.map((bx, i) => i !== sel && (
                <div key={i} style={{ position: "absolute", left: `${bx.x * 100}%`, top: `${bx.y * 100}%`, width: `${bx.w * 100}%`, height: `${bx.h * 100}%`, border: `1px dashed ${COLORS[i % COLORS.length]}`, opacity: 0.6, pointerEvents: "none" }} />
              ))}
              {box && b && (
                <div onPointerDown={(e) => onDown(e, "move")} style={{ position: "absolute", left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, border: `2px solid ${color}`, background: `${color}22`, cursor: "move" }}>
                  {bands.map((v, k) => {
                    const top = ((v - box.y) / box.h) * 100;
                    const floor = b.floorCount - k;
                    return (
                      <div key={k}>
                        <div onPointerDown={(e) => onDown(e, { band: k })} style={{ position: "absolute", left: 0, right: 0, top: `${top}%`, height: 10, marginTop: -5, cursor: "ns-resize", display: "flex", alignItems: "center" }}>
                          <div style={{ width: "100%", height: 0, borderTop: `1.5px solid ${color}` }} />
                        </div>
                        {k < bands.length - 1 && (
                          <span style={{ position: "absolute", insetInlineStart: 3, top: `${top + ((bands[k + 1] - v) / box.h) * 50}%`, transform: "translateY(-50%)", fontSize: 10, color: "var(--c-on-btn,#fff)", textShadow: "0 0 3px #000", pointerEvents: "none" }}>{floor}</span>
                        )}
                      </div>
                    );
                  })}
                  {slots.map((s, i) => (
                    <span key={i} style={{ position: "absolute", left: `${s * 100}%`, top: `${groundRow}%`, width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5, borderRadius: 999, background: color, border: "1.5px solid #fff", pointerEvents: "none" }} />
                  ))}
                  {(["nw", "ne", "sw", "se"] as const).map((c) => (
                    <span key={c} onPointerDown={(e) => onDown(e, c)} style={{ position: "absolute", [c.includes("n") ? "top" : "bottom"]: -7, [c.includes("w") ? "left" : "right"]: -7, width: 14, height: 14, borderRadius: 3, background: "var(--c-card,#fff)", border: `2px solid ${color}`, cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize" }} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : buildings.length > 0 ? <p style={{ margin: 0, color: "var(--qp-muted)" }}>{T.noImage[lang]}</p> : null}

        {issues.length > 0 && <ul role="alert" style={{ margin: 0, paddingInlineStart: "1.25rem", color: "var(--qp-error)", fontSize: "0.8125rem" }}>{issues.map((i, k) => <li key={k}>{i[lang]}</li>)}</ul>}
        {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ fontSize: "0.875rem", color: msg.kind === "error" ? "var(--qp-error)" : "var(--qp-success)" }}>{msg.text}</div>}
      </div>

      {b && (
        <div style={card}>
          <PlacementGrid lang={lang} building={b} units={units} types={types} busy={busy !== null} onApply={place} />
        </div>
      )}
    </div>
  );
}
