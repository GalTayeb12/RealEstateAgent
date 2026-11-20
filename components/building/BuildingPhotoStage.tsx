"use client";

/**
 * Immersive photo-based building explorer.
 *
 * A full-bleed photo of the project with one invisible hotspot per floor.
 * The active floor is "switched on": the rest of the photo dims, the floor's
 * real windows are brightened through a feathered backdrop-filter, and a warm
 * bloom is blended on top, so it reads as light coming from the apartment.
 * A glass panel (level number, units, slider, CTA) drives the same selection.
 *
 * Callbacks match the 3D scenes, so FloorPanel, UnitCard, URL state and the
 * keyboard handling in BuildingExplorer keep working unchanged.
 *
 * Calibration sidecar `<image-name>.json` (fractions of the image):
 *   { "aspect": 1.7769, "buildings": [ { "x": 0.05, "y": 0.10, "w": 0.38, "h": 0.74 } ] }
 * y is the top of the roof floor, y+h the ground. Buildings match sortIndex order.
 * Add ?debug=1 to the page URL to outline the hotspots while calibrating.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import { useBuyerMinRooms } from "@/components/useBuyerMinRooms";
import { roomsOf } from "@/lib/attributes";
import type { ExplorerBuilding, ExplorerUnit, FloorSelection, HoverInfo } from "./types";

// Meta shape (the on.json format) lives with the project experience config.
import type { PhotoBox, PhotoMeta, ProjectExperience, StationMeta } from "@/lib/experience/types";
import { loadPhotoStage } from "@/lib/experience/client";
export type { EnterMeta, PhotoBox, PhotoMeta, StationMeta } from "@/lib/experience/types";

/** Horizontal centre (fraction of box width) of the i-th of n apartments on a floor. */
function slotX(box: PhotoBox, i: number, n: number): number {
  const s = box.slots?.[i];
  return typeof s === "number" && s >= 0 && s <= 1 ? s : (i + 0.5) / n;
}

/** Top and height (image fractions) of one floor inside a building box. */
function floorSpan(box: PhotoBox, n: number, floor: number): { top: number; h: number } {
  if (box.bands && box.bands.length === n + 1) {
    const top = box.bands[n - floor];
    return { top, h: box.bands[n - floor + 1] - top };
  }
  const h = box.h / n;
  return { top: box.y + (n - floor) * h, h };
}

interface Cam { dx: number; dy: number; s: number; ox: number; oy: number }

const DEFAULT_ASPECT = 16 / 9;

function defaultMeta(count: number): PhotoMeta {
  const n = Math.max(count, 1);
  const w = Math.min(0.2, 0.7 / n);
  const gap = (1 - w * n) / (n + 1);
  return {
    aspect: DEFAULT_ASPECT,
    buildings: Array.from({ length: n }, (_, i) => ({
      x: gap + i * (w + gap), y: 0.1, w, h: 0.78,
    })),
  };
}

const STR = {
  he: {
    choose: "בחרו קומה",
    hint: "העבירו עכבר על קומה והיא תידלק. לחצו כדי להיכנס פנימה.",
    level: "קומה",
    penthouse: "פנטהאוז",
    available: "פנויות",
    none: "אין דירות פנויות",
    from: "החל מ־",
    unitsOnFloor: "דירות בקומה",
    cta: "צפו בדירות הקומה",
    tower: "מגדל",
    back: "חזרה לבניין",
    rooms: "חדרי הדירה",
    walk: "הליכה בדירה בתלת־ממד",
    pickTitle: "בחרו דירה",
    pickHint: "לחצו על דירה כדי להיכנס אליה",
    apt: "דירה",
    roomsN: "{n} חדרים",
    sold: "נמכרה",
    reserved: "שמורה",
    fewerRooms: "פחות חדרים ממה שביקשת",
    yourType: "הסוג שבחרת",
    sides: { 2: ["שמאל", "ימין"], 3: ["שמאל", "אמצע", "ימין"], 4: ["שמאל", "שמאל־מרכז", "ימין־מרכז", "ימין"] } as Record<number, string[]>,
  },
  en: {
    choose: "Choose your floor",
    hint: "Point at a floor and it lights up. Click to step inside.",
    level: "Level",
    penthouse: "Penthouse",
    available: "available",
    none: "No units available",
    from: "From ",
    unitsOnFloor: "Units on this floor",
    cta: "View floor",
    tower: "Tower",
    back: "Back to the tower",
    rooms: "Apartment rooms",
    walk: "Walk through in 3D",
    pickTitle: "Choose an apartment",
    pickHint: "Click an apartment to step inside",
    apt: "Apt",
    roomsN: "{n} rooms",
    sold: "Sold",
    reserved: "Reserved",
    fewerRooms: "Fewer rooms than you asked for",
    yourType: "The type you picked",
    sides: { 2: ["Left", "Right"], 3: ["Left", "Middle", "Right"], 4: ["Left", "Left-centre", "Right-centre", "Right"] } as Record<number, string[]>,
  },
} as const;

interface Active { buildingId: string; floor: number }

const ApartmentOverview = dynamic(() => import("@/components/walk/ApartmentOverview"), { ssr: false });

/** URL flag set on the walk's exit target so the stage reopens inside the apartment. */
const INSIDE_PARAM = "inside";

export default function BuildingPhotoStage({
  photoUrl,
  buildings,
  selectedFloor,
  onHover,
  onFloorClick,
  onBack,
  onUnitClick,
}: {
  photoUrl: string;
  buildings: ExplorerBuilding[];
  selectedFloor: FloorSelection | null;
  onHover: (info: HoverInfo | null, id?: string | null) => void;
  onFloorClick: (buildingId: string, floor: number) => void;
  onBack?: () => void;
  /** Apartment chosen in the floor picker; called right after onFloorClick when the fly-in lands. */
  onUnitClick?: (unitId: string) => void;
}) {
  const { m, locale } = useI18n();
  const copy = m.explorer;
  const isRtl = locale === "he";
  const t = STR[isRtl ? "he" : "en"];

  const sorted = useMemo(
    () => [...buildings].sort((a, b) => a.sortIndex - b.sortIndex),
    [buildings],
  );

  const [meta, setMeta] = useState<PhotoMeta>(() => defaultMeta(sorted.length));
  const [experience, setExperience] = useState<ProjectExperience | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  // Fly-in sequence: 0 idle, 1 dolly to floor, 2 window, 3 push through glass, 4 room fades in, 5 arrived
  const [step, setStep] = useState(0);
  const [cam, setCam] = useState<Cam | null>(null);
  const [follow, setFollow] = useState(false);
  const [followCam, setFollowCam] = useState<Cam | null>(null);
  const [station, setStation] = useState(0);
  // Floor picker: the zoomed floor, and the apartment chosen on it
  const [picking, setPicking] = useState<Active | null>(null);
  // Back from the walk (?inside&unit=…) the chosen apartment is restored from the URL
  const [picked, setPicked] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get(INSIDE_PARAM) !== null ? p.get("unit") : null;
  });
  const pickedRef = useRef<string | null>(null);
  useEffect(() => { pickedRef.current = picked; }, [picked]);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<number[]>([]);
  const pending = useRef<Active | null>(null);
  const lastPointer = useRef<string>("mouse");
  const touchArmed = useRef(false);
  const prevSelected = useRef<FloorSelection | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  useEffect(() => { if (step === 0) setStation(0); }, [step]);
  useEffect(() => {
    if (step === 0 && videoRef.current) {
      const v = videoRef.current;
      const id = window.setTimeout(() => { v.pause(); v.currentTime = 0; }, 900);
      return () => window.clearTimeout(id);
    }
  }, [step]);

  // Selection cleared (Esc or breadcrumb) while inside: fly back out.
  useEffect(() => {
    if (prevSelected.current && !selectedFloor && step > 0) {
      clearTimers();
      setStep(0);
    }
    prevSelected.current = selectedFloor;
  }, [selectedFloor, step, clearTimers]);

  // Back from the 3D walk (?inside=<station>): reopen the room tour directly, no fly-in.
  const resumeStation = useRef<number | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get(INSIDE_PARAM);
    if (v !== null) resumeStation.current = Math.max(0, parseInt(v, 10) || 0);
  }, []);
  useEffect(() => {
    if (resumeStation.current === null || !selectedFloor || !meta.enter) return;
    const idx = Math.min(resumeStation.current, Math.max((meta.enter.stations?.length ?? 1) - 1, 0));
    resumeStation.current = null;
    setActive({ buildingId: selectedFloor.buildingId, floor: selectedFloor.floor });
    setStep(5);
    setStation(idx);
    // The first station is the fly-in clip's last frame: park this building's clip there.
    const v = videoRef.current;
    const bi = sorted.findIndex((x) => x.id === selectedFloor.buildingId);
    const box = bi >= 0 ? meta.buildings[bi] : undefined;
    const clip = box?.video && box.video.startsWith("/") ? box.video : meta.enter.video;
    if (v && clip) {
      if (v.getAttribute("src") !== clip) v.setAttribute("src", clip);
      const toEnd = () => { if (Number.isFinite(v.duration)) v.currentTime = Math.max(0, v.duration - 0.04); };
      if (v.readyState >= 1) toEnd(); else v.addEventListener("loadedmetadata", toEnd, { once: true });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete(INSIDE_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot resume; sorted/meta.buildings are read at that moment
  }, [selectedFloor, meta.enter]);

  useEffect(() => {
    let cancelled = false;
    // project experience config (lib/experience) first, else the legacy JSON beside the photo
    loadPhotoStage(photoUrl, DEFAULT_ASPECT)
      .then(({ meta: m, experience: exp }) => {
        if (cancelled) return;
        setExperience(exp);
        if (m) setMeta(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [photoUrl]);

  const floorsWithUnits = (b: ExplorerBuilding) =>
    [...new Set(b.units.map((u) => u.floor))].sort((a, c) => a - c);

  const floorInfo = (b: ExplorerBuilding, floor: number) => {
    const units = b.units.filter((u) => u.floor === floor);
    const available = units.filter((u) => u.status === "available");
    const maxFloor = Math.max(...b.units.map((u) => u.floor), 1);
    const prices = available.map((u) => u.price ?? u.listPrice).filter((p) => p > 0);
    const labels = [...new Set(units.map((u) => u.unitLabel).filter(Boolean))];
    return {
      total: units.length,
      available: available.length,
      lobby: units.length === 0,
      isPenthouse: floor === maxFloor && units.length > 0,
      minPrice: prices.length ? Math.min(...prices) : null,
      labels,
    };
  };

  // The lit floor is the selected one, else the last one pointed at.
  const lit: Active | null = selectedFloor
    ? { buildingId: selectedFloor.buildingId, floor: selectedFloor.floor }
    : active;
  const litBuilding = lit ? sorted.find((b) => b.id === lit.buildingId) ?? null : null;
  const litIndex = litBuilding ? sorted.indexOf(litBuilding) : -1;
  const litBox = litIndex >= 0 ? meta.buildings[litIndex] : null;
  const litInfo = lit && litBuilding ? floorInfo(litBuilding, lit.floor) : null;

  const lightRect = (() => {
    if (!lit || !litBuilding || !litBox || !litInfo || litInfo.lobby) return null;
    const n = Math.max(litBuilding.floorCount, 1);
    const sp = floorSpan(litBox, n, lit.floor);
    return { left: litBox.x, width: litBox.w, top: sp.top, height: sp.h };
  })();

  const select = (buildingId: string, floor: number) => setActive({ buildingId, floor });

  /** Camera that centres a floor in the stage. ratio = share of the stage width the tower should fill. */
  const camFor = (buildingId: string, floor: number, ratio: number, minS: number, maxS: number): Cam | null => {
    const b = sorted.find((x) => x.id === buildingId);
    const bi = sorted.findIndex((x) => x.id === buildingId);
    const box = meta.buildings[bi];
    const fr = frameRef.current?.getBoundingClientRect();
    const st = rootRef.current?.getBoundingClientRect();
    if (!b || !box || !fr || !st) return null;
    const n = Math.max(b.floorCount, 1);
    const sp = floorSpan(box, n, floor);
    const cx = box.x + box.w / 2;
    const cy = sp.top + sp.h / 2;
    const px = fr.left + cx * fr.width;
    const py = fr.top + cy * fr.height;
    const s = Math.min(Math.max((ratio * st.width) / (box.w * fr.width), minS), maxS);
    return { dx: st.left + st.width / 2 - px, dy: st.top + st.height / 2 - py, s, ox: cx * 100, oy: cy * 100 };
  };

  // Slider drives the camera along the tower.
  useEffect(() => {
    if (!follow || step > 0 || !lit || selectedFloor) { setFollowCam(null); return; }
    setFollowCam(camFor(lit.buildingId, lit.floor, 0.62, 1.35, 2.4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, lit?.buildingId, lit?.floor, step, selectedFloor, meta]);
  useEffect(() => {
    if (!follow) return;
    const onResize = () => { if (lit) setFollowCam(camFor(lit.buildingId, lit.floor, 0.62, 1.35, 2.4)); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, lit?.buildingId, lit?.floor]);

  const finishEnter = useCallback(() => {
    clearTimers();
    setStep(5);
    const t = pending.current;
    pending.current = null;
    if (t) onFloorClick(t.buildingId, t.floor);
    if (t && pickedRef.current) onUnitClick?.(pickedRef.current);
  }, [clearTimers, onFloorClick, onUnitClick]);

  const startEnter = (buildingId: string, floor: number) => {
    const b = sorted.find((x) => x.id === buildingId);
    const bi = sorted.findIndex((x) => x.id === buildingId);
    const box = meta.buildings[bi];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fr = frameRef.current?.getBoundingClientRect();
    const st = rootRef.current?.getBoundingClientRect();
    if (!meta.enter || reduce || step > 0 || !b || !box || !fr || !st) {
      onFloorClick(buildingId, floor);
      return;
    }
    const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
    if (meta.enter.wide && meta.enter.video) {
      // Drone clip starts on the hero frame: crossfade straight into it, no zoom.
      pending.current = { buildingId, floor };
      select(buildingId, floor);
      clearTimers();
      setCam(null);
      setStep(2);
      const v = videoRef.current;
      // Per-building clip. Set imperatively so play() runs on the right source
      // in this same click (keeps the user-gesture for autoplay policies).
      const clip = box.video && box.video.startsWith("/") ? box.video : meta.enter.video;
      if (v && clip && v.getAttribute("src") !== clip) v.setAttribute("src", clip);
      if (v) v.currentTime = 0;
      v?.play().catch(() => finishEnter());
      at(15000, finishEnter);
      return;
    }
    const c = camFor(buildingId, floor, 0.82, 1.6, 6);
    if (!c) { onFloorClick(buildingId, floor); return; }
    pending.current = { buildingId, floor };
    select(buildingId, floor);
    setCam(c);
    setStep(1);
    clearTimers();
    at(950, () => {
      setStep(2);
      if (meta.enter?.video) {
        if (videoRef.current) videoRef.current.currentTime = 0;
        videoRef.current?.play().catch(() => finishEnter());
        at(12000, finishEnter);
      }
    });
    if (!meta.enter.video) {
      at(1550, () => setStep(3));
      at(2300, () => setStep(4));
      at(3500, finishEnter);
    }
  };

  /** Walk link: which unit to describe in its side panel, and where its exit button returns (this room tour). */
  const walkHref = (walk: string) => {
    const p = new URLSearchParams();
    if (lit && litBuilding) {
      const pageType = window.location.pathname.split("/").filter(Boolean).pop();
      const onFloor = litBuilding.units.filter((u) => u.floor === lit.floor);
      const unit = onFloor.find((u) => u.id === picked)
        ?? onFloor.find((u) => u.unitTypeId === pageType && u.status === "available")
        ?? onFloor.find((u) => u.unitTypeId === pageType) ?? onFloor[0];
      if (unit) p.set("unit", unit.id);
      const back = new URLSearchParams({ building: lit.buildingId, floor: String(lit.floor), [INSIDE_PARAM]: String(station) });
      if (unit && unit.id === picked) back.set("unit", unit.id);
      p.set("back", `${window.location.pathname}?${back.toString()}`);
    }
    const q = p.toString();
    return q ? `${walk}${walk.includes("?") ? "&" : "?"}${q}` : walk;
  };

  // ── Floor picker: zoom to the floor, then choose the apartment (side) ──
  const pickingCam = picking ? cam : null;
  const minRooms = useBuyerMinRooms();
  const pickUnits: ExplorerUnit[] = picking
    ? [...(sorted.find((b) => b.id === picking.buildingId)?.units ?? [])]
        .filter((u) => u.floor === picking.floor)
        .sort((a, c) => a.positionIndex - c.positionIndex)
    : [];

  /** Floor click: zoom in and show its apartments. Without a room tour, keep the old floor panel. */
  const startPick = (buildingId: string, floor: number) => {
    const b = sorted.find((x) => x.id === buildingId);
    const units = (b?.units ?? []).filter((u) => u.floor === floor);
    if (!meta.enter || step > 0 || units.length === 0) { startEnter(buildingId, floor); return; }
    if (units.length === 1) { pickApartment(units[0], buildingId); return; }
    const c = camFor(buildingId, floor, 0.8, 1.5, 4.5);
    clearTimers();
    setFollow(false);
    select(buildingId, floor);
    setCam(c);
    setPicked(null);
    setPicking({ buildingId, floor });
    onHover(null, null);
  };
  const cancelPick = () => { setPicking(null); setCam(null); };
  function pickApartment(u: ExplorerUnit, buildingId: string) {
    setPicked(u.id);
    pickedRef.current = u.id;
    setPicking(null);
    // startEnter bails out when a step is running; picking keeps step at 0.
    startEnter(buildingId, u.floor);
  }
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cancelPick(); } };
    const onResize = () => setCam(camFor(picking.buildingId, picking.floor, 0.8, 1.5, 4.5));
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);

  // Slider drives the active building's floors that have units.
  const panelBuilding = litBuilding ?? sorted[0] ?? null;
  const panelFloors = panelBuilding ? floorsWithUnits(panelBuilding) : [];
  const sliderIndex = lit && panelFloors.includes(lit.floor) ? panelFloors.indexOf(lit.floor) : -1;
  const showPanel = !selectedFloor && !picking && panelBuilding;

  const dim = Boolean(lightRect);

  // Keyboard: up/down moves the lit floor, Enter steps inside.
  useEffect(() => {
    if (step !== 0 || selectedFloor || !panelBuilding || panelFloors.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = lit && panelFloors.includes(lit.floor) ? panelFloors.indexOf(lit.floor) : Math.floor(panelFloors.length / 2);
        const next = Math.min(Math.max(idx + (e.key === "ArrowUp" ? 1 : -1), 0), panelFloors.length - 1);
        setFollow(true);
        select(panelBuilding.id, panelFloors[next]);
      } else if (e.key === "Enter" && lit && litInfo && !litInfo.lobby && !(e.target as HTMLElement | null)?.closest("button")) {
        startPick(lit.buildingId, lit.floor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedFloor, panelBuilding?.id, panelFloors.join(","), lit?.buildingId, lit?.floor, litInfo?.lobby, meta]);

  // Keyboard: left/right between room stations once inside.
  const stationCount = meta.enter?.stations?.length ?? 0;
  useEffect(() => {
    if (step < 5 || stationCount < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const dir = (e.key === "ArrowRight" ? 1 : -1) * (isRtl ? -1 : 1);
      setStation((s) => Math.min(Math.max(s + dir, 0), stationCount - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, stationCount, isRtl]);

  const tagScale = step === 0 && followCam ? followCam.s : 1;
  // Not enough room right of the tower: put the tag on its left side.
  const flipTag = Boolean(litBox && litBox.x + litBox.w > 0.7);

  return (
    <div ref={rootRef} className="hn-ps" style={{ position: "absolute", inset: 0, overflow: "clip", background: "#0b1020", containerType: "size" }}>
      <style>{`
        .hn-ps-frame {
          position: absolute; left: 50%; top: 50%;
          width: max(100cqw, calc(100cqh * var(--aspect) * .9));
          aspect-ratio: var(--aspect);
          transform: translate(-50%, -50%);
        }
        /* Portrait phones: fit both towers instead of cropping them in half */
        @container (orientation: portrait) {
          .hn-ps-frame { width: calc(100cqw / 0.82); top: 42%; }
        }
        .hn-ps-cam { position: absolute; inset: 0; will-change: transform; }
        .hn-ps-fly { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none; pointer-events: none; }
        .hn-ps-station-img { transition: opacity 1s ease, transform 8s ease-out; animation: hn-ps-kb 14s ease-out both; }
        /* Plans / cutaways: whole image on a dark backdrop, clear of the unit panel and caption */
        .hn-ps-station-img[data-fit="contain"] {
          object-fit: contain; box-sizing: border-box;
          padding: calc(var(--qp-nav-h, 64px) + 1rem) calc(272px + 2vw) 10.5rem 3vw;
          background: radial-gradient(ellipse at 40% 45%, #2a3550 0%, #0b1020 75%);
        }
        @media (max-width: 640px) {
          .hn-ps-station-img[data-fit="contain"] { padding: calc(var(--qp-nav-h, 64px) + .5rem) 3vw 58vh; }
        }
        @keyframes hn-ps-kb { from { scale: 1.08; } to { scale: 1; } }
        /* Floor picker: one label per apartment, above its spot on the facade */
        .hn-ps-apt {
          position: absolute; z-index: 4; pointer-events: auto; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 1px;
          padding: 6px 11px 7px; border-radius: 10px; border: 1px solid rgba(255,255,255,.55);
          background: rgba(255,252,246,.94); color: #123F40; font: inherit; line-height: 1.25; white-space: nowrap;
          box-shadow: 0 8px 22px rgba(0,0,0,.35);
          animation: hn-ps-apt-in .45s cubic-bezier(.22,1,.36,1) backwards;
          transition: background .15s, box-shadow .15s;
        }
        .hn-ps-apt::after {
          content: ""; position: absolute; left: 50%; bottom: -7px; translate: -50% 0;
          border: 7px solid transparent; border-bottom: 0; border-top-color: rgba(255,252,246,.94);
        }
        .hn-ps-apt b { font-size: 13px; }
        .hn-ps-apt span { font-size: 11.5px; opacity: .85; font-variant-numeric: tabular-nums; }
        .hn-ps-apt small { font-size: 10.5px; font-weight: 700; color: #756039; }
        .hn-ps-apt:hover, .hn-ps-apt:focus-visible { background: #fff; box-shadow: 0 10px 26px rgba(0,0,0,.45), 0 0 0 3px rgba(232,182,94,.85); outline: none; }
        .hn-ps-apt[data-mine] { border-color: #e8b65e; box-shadow: 0 8px 22px rgba(0,0,0,.35), 0 0 0 2px #e8b65e; }
        .hn-ps-apt[data-dim] { opacity: .62; }
        .hn-ps-apt[disabled] { cursor: default; opacity: .5; text-decoration: line-through; }
        @keyframes hn-ps-apt-in { from { opacity: 0; translate: 0 8px; } }
        .hn-ps-pickbar {
          position: absolute; z-index: 6; left: 50%; bottom: clamp(1rem, 4vh, 2rem); translate: -50% 0;
          display: flex; align-items: center; gap: .9rem; padding: .55rem .6rem .55rem 1.1rem; border-radius: 999px;
          background: rgba(10,14,24,.62); color: #fff; border: 1px solid rgba(255,255,255,.22);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); white-space: nowrap; max-width: 94vw;
          animation: hn-ps-rise .5s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-pickbar b { font-size: .95rem; }
        .hn-ps-pickbar span { font-size: .82rem; opacity: .8; }
        .hn-ps-pickbar button { font: inherit; font-size: .82rem; color: #fff; cursor: pointer; padding: .4rem .9rem; border-radius: 999px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); }
        .hn-ps-pickbar button:hover { background: rgba(255,255,255,.22); }
        @media (max-width: 640px) { .hn-ps-pickbar span { display: none; } }
        @media (prefers-reduced-motion: reduce) { .hn-ps-apt, .hn-ps-pickbar { animation: none; } }
        /* Interactive dollhouse: same frame as the contain stills */
        .hn-ps-3d {
          position: absolute; inset: 0; z-index: 5; box-sizing: border-box;
          padding: calc(var(--qp-nav-h, 64px) + 4rem) calc(272px + 2vw) 10.5rem 3vw;
          background: radial-gradient(ellipse at 40% 45%, #2a3550 0%, #0b1020 75%);
          animation: hn-ps-rise .6s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-3d > div { position: relative; width: 100%; height: 100%; }
        @media (max-width: 640px) {
          .hn-ps-3d { padding: calc(var(--qp-nav-h, 64px) + 3.5rem) 3vw 58vh; }
        }
        .hn-ps-topbar {
          position: absolute; z-index: 6; top: calc(var(--qp-nav-h, 64px) + 1rem); left: clamp(1rem, 4vw, 3.5rem);
          display: flex; flex-wrap: wrap; gap: .5rem; max-width: calc(100% - 2rem);
          animation: hn-ps-rise .7s .2s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-topbar > button, .hn-ps-topbar > a {
          padding: .5rem 1rem; font: inherit; font-size: .82rem; color: #fff; cursor: pointer;
          background: rgba(10,14,24,.45); border: 1px solid rgba(255,255,255,.28); border-radius: 999px;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          text-decoration: none; white-space: nowrap;
        }
        .hn-ps-topbar > button:hover, .hn-ps-topbar > a:hover { background: rgba(10,14,24,.65); }
        .hn-ps-topbar > [aria-pressed="true"] { background: rgba(255,230,176,.3); }
        .hn-ps-topbar > .hn-ps-walk { background: rgba(232,182,94,.92); color: #1d1a14; font-weight: 600; border-color: transparent; }
        .hn-ps-topbar > .hn-ps-walk:hover { background: rgba(240,196,116,1); }
        .hn-ps-caption {
          position: absolute; z-index: 6; bottom: clamp(5rem, 12vh, 7rem); max-width: min(30rem, 42vw); color: #fff;
          text-shadow: 0 2px 22px rgba(0,0,0,.65);
          animation: hn-ps-rise .9s .35s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-caption h3 { margin: .2rem 0 .4rem; font-family: var(--font-fraunces, serif); font-weight: 400; font-size: clamp(1.7rem, 3.2vw, 2.7rem); line-height: 1.08; }
        .hn-ps-caption p { margin: 0; font-size: .95rem; line-height: 1.55; opacity: .92; }
        .hn-ps-stations {
          position: absolute; z-index: 6; bottom: clamp(1rem, 3vh, 1.75rem); left: 50%; transform: translateX(-50%);
          display: flex; gap: .4rem; padding: .35rem; border-radius: 999px; max-width: 92vw; overflow-x: auto;
          background: rgba(10,14,24,.42); border: 1px solid rgba(255,255,255,.24);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          animation: hn-ps-rise .8s .5s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-station {
          padding: .45rem .95rem; font: inherit; font-size: .82rem; color: #fff; cursor: pointer; white-space: nowrap;
          background: transparent; border: 0; border-radius: 999px; transition: background .2s;
        }
        .hn-ps-station[aria-selected="true"] { background: rgba(255,230,176,.3); }
        /* Rooms bar steps aside on the dollhouse station (not needed there) */
        .hn-ps-stations { transition: translate .55s cubic-bezier(.22,1,.36,1), opacity .45s ease, visibility 0s; }
        .hn-ps-stations[data-away] { translate: 0 calc(100% + 2.5rem); opacity: 0; visibility: hidden; pointer-events: none; transition: translate .45s cubic-bezier(.55,0,.8,.4), opacity .35s ease .05s, visibility 0s .45s; }
        @media (prefers-reduced-motion: reduce) { .hn-ps-stations, .hn-ps-stations[data-away] { transition: opacity .2s ease, visibility 0s .2s; translate: none; } }
        @media (max-width: 760px) { .hn-ps-caption { max-width: 86vw; bottom: 5.2rem; } }
        .hn-ps-skip { position: absolute; inset: 0; z-index: 6; border: 0; background: transparent; cursor: pointer; }
        .hn-ps-img {
          width: 100%; height: 100%; display: block; object-fit: cover; user-select: none;
          transition: filter .6s ease;
          animation: hn-ps-drift 28s ease-in-out infinite alternate;
        }
        @keyframes hn-ps-drift { from { transform: scale(1.0); } to { transform: scale(1.035); } }
        .hn-ps-tag { position: absolute; z-index: 3; display: flex; align-items: center; pointer-events: none; animation: hn-ps-tag-in .35s cubic-bezier(.22,1,.36,1) both; transition: top .45s cubic-bezier(.22,1,.36,1), left .45s cubic-bezier(.22,1,.36,1); }
        .hn-ps-tag--flip { flex-direction: row-reverse; }
        .hn-ps-tag--flip .hn-ps-tag__line { transform: scaleX(-1); }
        .hn-ps-tag__line { width: clamp(14px, 2.2cqw, 40px); height: 1px; background: linear-gradient(to right, rgba(255,230,176,.95), rgba(255,230,176,.25)); }
        .hn-ps-tag__box {
          display: flex; flex-direction: column; gap: .1rem; padding: .45rem .75rem; white-space: nowrap; color: #fff;
          font-size: clamp(.62rem, .95cqw, .82rem); line-height: 1.35;
          background: rgba(10,14,24,.55); border: 1px solid rgba(255,230,176,.4); border-radius: 10px;
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .hn-ps-tag__box b { font-family: var(--font-fraunces, serif); font-weight: 500; font-size: 1.25em; color: #ffe6b0; }
        .hn-ps-tag__box .ok { color: #ffe096; }
        @keyframes hn-ps-tag-in { from { opacity: 0; margin-left: -8px; } to { opacity: 1; margin-left: 0; } }
        @media (max-width: 760px) { .hn-ps-tag { display: none; } }
        .hn-ps-floor { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; outline: none; }
        .hn-ps-floor:disabled { cursor: default; }
        .hn-ps-floor:focus-visible { box-shadow: inset 0 0 0 2px rgba(255,255,255,.9); }

        .hn-ps-light { z-index: 1;
          position: absolute; pointer-events: none;
          transition: left .45s cubic-bezier(.22,1,.36,1), top .45s cubic-bezier(.22,1,.36,1),
                      width .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1), opacity .4s ease;
        }
        /* The "lights on" photo, revealed only inside the active floor */
        .hn-ps-on { z-index: 0;
          position: absolute; overflow: clip;
          animation: hn-ps-on-in .45s ease both;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%),
                              linear-gradient(to right, transparent 0, #000 3%, #000 97%, transparent 100%);
          -webkit-mask-composite: source-in;
                  mask-image: linear-gradient(to bottom, transparent 0, #000 9%, #000 91%, transparent 100%),
                              linear-gradient(to right, transparent 0, #000 3%, #000 97%, transparent 100%);
                  mask-composite: intersect;
        }
        .hn-ps-on img { position: absolute; max-width: none; user-select: none; }
        @keyframes hn-ps-on-in { from { opacity: 0; } to { opacity: 1; } }
        /* Warm bloom on top: light spilling out of the apartment */
        .hn-ps-light__bloom {
          position: absolute; inset: -34% -12%;
          background:
            radial-gradient(ellipse 55% 52% at 50% 50%, rgba(255,214,140,.62) 0%, rgba(255,190,110,.30) 42%, transparent 72%);
          mix-blend-mode: screen; filter: blur(10px);
          animation: hn-ps-breathe 3.6s ease-in-out infinite;
        }
        /* Soft spill onto the balcony slab below */
        .hn-ps-light__spill {
          position: absolute; left: 4%; right: 4%; top: 92%; height: 70%;
          background: linear-gradient(to bottom, rgba(255,200,120,.30), transparent);
          mix-blend-mode: screen; filter: blur(8px);
        }
        @keyframes hn-ps-breathe { 0%,100% { opacity: .86; } 50% { opacity: 1; } }

        .hn-ps-vignette {
          position: absolute; inset: 0; pointer-events: none; z-index: 2;
          background:
            radial-gradient(ellipse at 50% 55%, transparent 52%, rgba(6,10,24,.55) 100%),
            linear-gradient(to bottom, rgba(6,10,24,.55) 0%, rgba(6,10,24,0) 26%),
            linear-gradient(to top, var(--qp-bg) 0%, rgba(245,242,236,0) 16%);
        }
        .hn-ps-head {
          position: absolute; top: 0; left: 0; right: 0; z-index: 4; pointer-events: none;
          padding: calc(var(--qp-nav-h, 64px) + clamp(1rem, 3vh, 2rem)) 1.25rem 0; text-align: center; color: #fff;
          animation: hn-ps-rise .9s .15s cubic-bezier(.22,1,.36,1) backwards;
        }
        .hn-ps-head h2 {
          margin: 0; font-family: var(--font-fraunces, serif); font-weight: 500;
          font-size: clamp(1.5rem, 3.4vw, 2.6rem); letter-spacing: .01em;
          text-shadow: 0 2px 24px rgba(0,0,0,.55);
        }
        .hn-ps-head p { margin: .3rem 0 0; font-size: .82rem; opacity: .78; text-shadow: 0 1px 12px rgba(0,0,0,.6); }

        .hn-ps-panel {
          position: absolute; z-index: 5; top: 50%; transform: translateY(-50%);
          width: min(310px, 28vw); min-width: 270px;
          padding: 1.4rem 1.4rem 1.25rem; color: #fff;
          background: linear-gradient(160deg, rgba(255,255,255,.17), rgba(255,255,255,.07));
          border: 1px solid rgba(255,255,255,.26); border-radius: 18px;
          backdrop-filter: blur(22px) saturate(1.4); -webkit-backdrop-filter: blur(22px) saturate(1.4);
          box-shadow: 0 24px 60px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.3);
          animation: hn-ps-rise .8s .3s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes hn-ps-rise { from { opacity: 0; translate: 0 14px; } to { opacity: 1; translate: 0 0; } }
        .hn-ps-eyebrow { font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; opacity: .72; }
        .hn-ps-title { margin: .15rem 0 .5rem; font-family: var(--font-fraunces, serif); font-size: 1.7rem; font-weight: 500; line-height: 1.1; }
        .hn-ps-level { display: flex; align-items: baseline; gap: .6rem; margin: .2rem 0 .35rem; }
        .hn-ps-level small { font-size: .8rem; opacity: .8; letter-spacing: .06em; }
        .hn-ps-level b { font-family: var(--font-fraunces, serif); font-weight: 400; font-size: 4.2rem; line-height: .95; color: #ffe6b0; text-shadow: 0 0 28px rgba(255,200,110,.55); }
        .hn-ps-pen { font-family: var(--font-fraunces, serif); font-size: 2.2rem; color: #ffe6b0; text-shadow: 0 0 28px rgba(255,200,110,.55); }
        .hn-ps-meta { font-size: .85rem; line-height: 1.55; opacity: .92; }
        .hn-ps-meta .ok { color: #ffe096; font-weight: 600; }
        .hn-ps-chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
        .hn-ps-chip { font-size: .72rem; padding: .18rem .6rem; border-radius: 999px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.2); }
        .hn-ps-tabs { display: flex; gap: .4rem; margin-bottom: .85rem; }
        .hn-ps-tab {
          flex: 1; padding: .4rem .5rem; font: inherit; font-size: .78rem; color: #fff; cursor: pointer;
          background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); border-radius: 10px; transition: background .2s;
        }
        .hn-ps-tab[aria-pressed="true"] { background: rgba(255,230,176,.28); border-color: rgba(255,230,176,.7); }
        .hn-ps-slider { width: 100%; margin: 1rem 0 .3rem; accent-color: #ffd98a; cursor: pointer; }
        .hn-ps-range { display: flex; justify-content: space-between; font-size: .68rem; opacity: .65; }
        .hn-ps-cta {
          width: 100%; margin-top: 1rem; padding: .75rem 1rem; font: inherit; font-weight: 600; font-size: .92rem;
          color: #2a1a05; cursor: pointer; border: 0; border-radius: 12px;
          background: linear-gradient(135deg, #ffe6b0, #ffc979);
          box-shadow: 0 8px 26px rgba(255,190,100,.38); transition: transform .15s, box-shadow .2s, opacity .2s;
        }
        .hn-ps-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(255,190,100,.55); }
        .hn-ps-cta:disabled { opacity: .4; cursor: default; }
        .hn-ps-empty { font-size: .88rem; line-height: 1.55; opacity: .88; margin: .2rem 0 .4rem; }

        @media (max-width: 760px) {
          .hn-ps-panel { top: auto; bottom: 0; left: 0 !important; right: 0 !important; width: auto; min-width: 0;
            transform: none; border-radius: 18px 18px 0 0; padding: 1rem 1.1rem 1.1rem; }
          .hn-ps-level b { font-size: 3rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hn-ps-img, .hn-ps-light__bloom, .hn-ps-head, .hn-ps-panel, .hn-ps-on, .hn-ps-station-img, .hn-ps-topbar, .hn-ps-caption, .hn-ps-stations, .hn-ps-tag { animation: none; }
          .hn-ps-light { z-index: 1; transition: none; }
        }
      `}</style>

      {/* blurred backdrop fills any space the pulled-back photo leaves */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt="" aria-hidden draggable={false}
        style={{ position: "absolute", inset: "-4%", width: "108%", height: "108%", objectFit: "cover", filter: "blur(28px) brightness(.55) saturate(1.2)" }} />

      <div ref={frameRef} className="hn-ps-frame" style={{ ["--aspect" as string]: String(meta.aspect) }}>
        <div
          className="hn-ps-cam"
          style={{
            transformOrigin: (() => { const c = step >= 1 || picking ? cam : followCam; return c ? `${c.ox}% ${c.oy}%` : "50% 50%"; })(),
            transform: (() => {
              const c = step >= 1 || picking ? cam : followCam;
              return c ? `translate(${c.dx}px, ${c.dy}px) scale(${c.s})` : "none";
            })(),
            transition: step >= 1 || picking ? "transform 1.1s cubic-bezier(.65,0,.3,1)" : "transform 1.1s cubic-bezier(.4,0,.2,1)",
            pointerEvents: step > 0 || picking ? "none" : undefined,
          }}
        >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={meta.offImage ?? photoUrl}
          alt={copy.title}
          draggable={false}
          className="hn-ps-img"
          style={{ filter: dim ? (meta.offImage ? "brightness(.88)" : "brightness(.62) saturate(.92)") : "none" }}
        />

        {/* The lit floor */}
        <div
          aria-hidden
          className="hn-ps-light"
          style={{
            opacity: lightRect ? 1 : 0,
            left: `${(lightRect?.left ?? 0) * 100}%`,
            top: `${(lightRect?.top ?? 0) * 100}%`,
            width: `${(lightRect?.width ?? 0) * 100}%`,
            height: `${(lightRect?.height ?? 0) * 100}%`,
          }}
        >
          <div className="hn-ps-light__bloom" />
          <div className="hn-ps-light__spill" />
        </div>

        {/* Lights-on reveal for the active floor */}
        {meta.offImage && lightRect && lit && (
          <div
            key={`${lit.buildingId}-${lit.floor}`}
            aria-hidden
            className="hn-ps-on"
            style={{
              left: `${(lightRect.left - 0.004) * 100}%`,
              top: `${(lightRect.top - 0.006) * 100}%`,
              width: `${(lightRect.width + 0.008) * 100}%`,
              height: `${(lightRect.height + 0.012) * 100}%`,
              pointerEvents: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              draggable={false}
              style={{
                width: `${100 / (lightRect.width + 0.008)}%`,
                height: `${100 / (lightRect.height + 0.012)}%`,
                left: `${-((lightRect.left - 0.004) / (lightRect.width + 0.008)) * 100}%`,
                top: `${-((lightRect.top - 0.006) / (lightRect.height + 0.012)) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Floating tag anchored to the lit floor */}
        {lightRect && litInfo && lit && step === 0 && !selectedFloor && !picking && (
          <div
            key={`tag-${lit.buildingId}-${lit.floor}`}
            aria-hidden
            className={`hn-ps-tag${flipTag ? " hn-ps-tag--flip" : ""}`}
            style={{
              ...(flipTag
                ? { right: `${(1 - lightRect.left) * 100}%` }
                : { left: `${(lightRect.left + lightRect.width) * 100}%` }),
              top: `${(lightRect.top + lightRect.height / 2) * 100}%`,
              transform: `translateY(-50%) scale(${1 / tagScale})`,
              transformOrigin: flipTag ? "right center" : "left center",
            }}
          >
            <span className="hn-ps-tag__line" />
            <div className="hn-ps-tag__box">
              <b>{litInfo.isPenthouse ? t.penthouse : `${t.level} ${lit.floor}`}</b>
              <span className={litInfo.available > 0 ? "ok" : ""}>
                {litInfo.available > 0 ? `${litInfo.available} ${t.available}` : t.none}
              </span>
              {litInfo.minPrice !== null && <span>{t.from}<Money amount={litInfo.minPrice} /></span>}
            </div>
          </div>
        )}

        {/* Hit areas, one per floor */}
        {sorted.map((b, bi) => {
          const box = meta.buildings[bi];
          if (!box) return null;
          const n = Math.max(b.floorCount, 1);
          return Array.from({ length: n }, (_, i) => {
            const floor = n - i;
            const info = floorInfo(b, floor);
            const sp = floorSpan(box, n, floor);
            return (
              <button
                key={`${b.id}-${floor}`}
                type="button"
                className="hn-ps-floor"
                disabled={info.lobby}
                aria-label={`${b.name} · ${copy.floor} ${floor}`}
                onMouseEnter={() => {
                  if (info.lobby) return;
                  setFollow(false);
                  select(b.id, floor);
                  onHover(
                    {
                      buildingName: b.name, floor, lobby: false,
                      availableCount: info.available, totalCount: info.total, isPenthouse: info.isPenthouse,
                    },
                    b.id,
                  );
                }}
                onMouseLeave={() => onHover(null, null)}
                onFocus={() => { if (!info.lobby) select(b.id, floor); }}
                onPointerDown={(e) => { lastPointer.current = e.pointerType; }}
                onClick={() => {
                  // Touch: the first tap lights the floor, a second tap on it flies in.
                  const isLit = lit?.buildingId === b.id && lit.floor === floor && touchArmed.current;
                  if (lastPointer.current === "touch" && !isLit) {
                    touchArmed.current = true;
                    setFollow(false);
                    select(b.id, floor);
                    return;
                  }
                  touchArmed.current = false;
                  startPick(b.id, floor);
                }}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${sp.top * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${sp.h * 100}%`,
                  boxShadow: debug ? "inset 0 0 0 1px rgba(255,0,100,.8)" : undefined,
                }}
              />
            );
          });
        })}

        {/* Floor picker: apartments of the zoomed floor, each above its place on the facade */}
        {picking && pickingCam && (() => {
          const bi = sorted.findIndex((x) => x.id === picking.buildingId);
          const b = sorted[bi];
          const box = meta.buildings[bi];
          if (!b || !box) return null;
          const sp = floorSpan(box, Math.max(b.floorCount, 1), picking.floor);
          const pageType = window.location.pathname.split("/").filter(Boolean).pop();
          const sides = t.sides[pickUnits.length];
          return pickUnits.map((u, i) => {
            const rooms = roomsOf(null, u.unitLabel);
            const fewer = minRooms != null && rooms != null && rooms < minRooms;
            const sold = u.status === "sold";
            const price = u.price ?? u.listPrice;
            return (
              <button
                key={u.id}
                type="button"
                className="hn-ps-apt"
                disabled={sold}
                data-dim={fewer || undefined}
                data-mine={u.unitTypeId === pageType || undefined}
                aria-label={`${t.apt} ${u.unitNumber} · ${u.unitLabel}${sides ? ` · ${sides[i]}` : ""}`}
                // eslint-disable-next-line react-hooks/refs -- click handler; pickApartment writes pickedRef on click, not during render
                onClick={() => pickApartment(u, b.id)}
                style={{
                  left: `${(box.x + box.w * slotX(box, i, pickUnits.length)) * 100}%`,
                  top: `${sp.top * 100}%`,
                  transform: `translate(-50%, calc(-100% - 8px)) scale(${1 / pickingCam.s})`,
                  transformOrigin: "50% calc(100% + 8px)",
                  animationDelay: `${0.55 + i * 0.07}s`,
                }}
              >
                <b>{t.apt} {u.unitNumber}{sides ? ` · ${sides[i]}` : ""}</b>
                <span>{u.unitLabel}</span>
                <span>{sold ? t.sold : u.status === "reserved" ? t.reserved : price > 0 ? <Money amount={price} /> : null}</span>
                {fewer ? <small>{t.fewerRooms}</small> : u.unitTypeId === pageType ? <small>{t.yourType}</small> : null}
              </button>
            );
          });
        })()}
        </div>
      </div>

      {picking && (
        <div className="hn-ps-pickbar" role="group" aria-label={t.pickTitle}>
          <b>
            {sorted.find((b) => b.id === picking.buildingId)?.name} · {t.level} {picking.floor}
          </b>
          <span>{t.pickHint}</span>
          <button type="button" onClick={cancelPick}>{isRtl ? "→ " : "← "}{t.back}</button>
        </div>
      )}

      <div className="hn-ps-vignette" aria-hidden />

      {/* Fly-in layers: window close-up, then the living room */}
      {meta.enter && (
        <>
          {!meta.enter.video && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="hn-ps-fly"
            src={meta.enter.room}
            alt=""
            aria-hidden
            draggable={false}
            style={{
              opacity: step >= 4 ? 1 : 0,
              transform: step >= 4 ? "scale(1)" : "scale(1.22)",
              transition: step >= 4 ? "opacity 1s ease, transform 2s cubic-bezier(.2,.7,.2,1)" : "opacity .7s ease, transform 0s .7s",
              zIndex: 3,
            }}
          />
          )}
          {meta.enter.video ? (
            <video
              ref={videoRef}
              className="hn-ps-fly"
              src={meta.enter.video}
              muted
              playsInline
              preload="auto"
              onEnded={finishEnter}
              style={{ opacity: step >= 2 ? 1 : 0, transition: step >= 2 ? "opacity .7s ease" : "opacity .6s ease .3s", zIndex: 4 }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="hn-ps-fly"
              src={meta.enter.window}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                opacity: step >= 2 && step < 4 ? 1 : 0,
                transformOrigin: "50% 56%",
                transform: step >= 3 ? "scale(2.6)" : "scale(1)",
                filter: step >= 3 ? "blur(1.5px)" : "none",
                transition: step >= 3
                  ? "transform 1.9s cubic-bezier(.55,0,.9,.45), filter 1.9s ease, opacity .8s ease .9s"
                  : step >= 2 ? "opacity .7s ease" : "opacity .5s ease, transform 0s .5s",
                zIndex: 4,
              }}
            />
          )}
          {step >= 1 && step <= 4 && (
            <button type="button" className="hn-ps-skip" aria-label="Skip" onClick={finishEnter} />
          )}
        </>
      )}

      {/* Inside the apartment: room stations */}
      {meta.enter && step >= 5 && (() => {
        const stations: StationMeta[] = meta.enter.stations && meta.enter.stations.length
          ? meta.enter.stations
          : [{ id: "living", title: { he: "הסלון", en: "The living room" } }];
        const cur = stations[Math.min(station, stations.length - 1)];
        const lang = isRtl ? "he" : "en";
        return (
          <>
            {cur.view3d && experience && (
              <div className="hn-ps-3d" key={`3d-${cur.id}`}>
                <div><ApartmentOverview experience={experience} /></div>
              </div>
            )}
            {stations.map((st, i) => st.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={st.id}
                className="hn-ps-fly hn-ps-station-img"
                src={st.image}
                alt=""
                aria-hidden
                draggable={false}
                style={{
                  opacity: i === station ? 1 : 0, zIndex: 4,
                }}
                data-fit={st.fit === "contain" ? "contain" : undefined}
              />
            ) : null)}

            <div className="hn-ps-topbar">
              {onBack && (
                <button type="button" onClick={onBack}>
                  {isRtl ? "→ " : "← "}{t.back}
                </button>
              )}
              {stations.map((st, i) => st.fit === "contain" && (
                <button key={st.id} type="button" aria-pressed={i === station} onClick={() => setStation(i)}>
                  {st.title[lang]}
                </button>
              ))}
              {meta.enter?.walk && (
                <a className="hn-ps-walk" href={walkHref(meta.enter.walk)}>{t.walk}</a>
              )}
            </div>

            <div className="hn-ps-caption" key={cur.id} style={{ left: "clamp(1rem, 4vw, 3.5rem)", direction: isRtl ? "rtl" : "ltr", textAlign: isRtl ? "right" : "left" }}>
              {lit && litBuilding && (
                <div className="hn-ps-eyebrow">
                  {litBuilding.name} · {t.level} {lit.floor}
                  {(() => { const u = litBuilding.units.find((x) => x.id === picked); return u ? ` · ${t.apt} ${u.unitNumber}` : ""; })()}
                </div>
              )}
              <h3>{cur.title[lang]}</h3>
              {cur.text && <p>{cur.text[lang]}</p>}
            </div>

            {stations.some((st) => st.fit !== "contain") && (
              <div className="hn-ps-stations" role="tablist" aria-label={t.rooms} data-away={cur.view3d || undefined} aria-hidden={cur.view3d || undefined}>
                {stations.map((st, i) => st.fit !== "contain" && (
                  <button
                    key={st.id}
                    type="button"
                    role="tab"
                    aria-selected={i === station}
                    className="hn-ps-station"
                    onClick={() => setStation(i)}
                  >
                    {st.title[lang]}
                  </button>
                ))}
              </div>
            )}
          </>
        );
      })()}

      <div className="hn-ps-head" style={{ opacity: step > 0 || picking ? 0 : 1, visibility: step > 0 || picking ? "hidden" : "visible", transition: step > 0 || picking ? "opacity .4s ease, visibility 0s .4s" : "opacity .4s ease" }}>
        <h2>{copy.title}</h2>
        <p>{t.hint}</p>
      </div>

      {/* Glass floor picker */}
      {showPanel && step === 0 && panelBuilding && (
        <aside
          className="hn-ps-panel"
          style={{ [litIndex === 0 ? "right" : "left"]: "clamp(1rem, 4vw, 3.5rem)" }}
          aria-live="polite"
        >
          <div className="hn-ps-eyebrow">{t.choose}</div>

          {sorted.length > 1 && (
            <div className="hn-ps-tabs" style={{ marginTop: ".6rem" }}>
              {sorted.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="hn-ps-tab"
                  aria-pressed={b.id === panelBuilding.id}
                  onClick={() => {
                    const fl = floorsWithUnits(b);
                    const keep = lit && fl.includes(lit.floor) ? lit.floor : fl[Math.floor(fl.length / 2)];
                    if (keep !== undefined) { setFollow(true); select(b.id, keep); }
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {litInfo && lit && !litInfo.lobby ? (
            <>
              <div className="hn-ps-level">
                {litInfo.isPenthouse ? (
                  <span className="hn-ps-pen">{t.penthouse}</span>
                ) : (
                  <>
                    <small>{t.level}</small>
                    <b>{lit.floor}</b>
                  </>
                )}
              </div>
              <div className="hn-ps-meta">
                {litInfo.available > 0 ? (
                  <span className="ok">{litInfo.available} {t.available}</span>
                ) : (
                  <span>{t.none}</span>
                )}
                {litInfo.minPrice !== null && (
                  <div>{t.from}<Money amount={litInfo.minPrice} /></div>
                )}
              </div>
              {litInfo.labels.length > 0 && (
                <div className="hn-ps-chips" aria-label={t.unitsOnFloor}>
                  {litInfo.labels.map((l) => <span key={l} className="hn-ps-chip">{l}</span>)}
                </div>
              )}
            </>
          ) : (
            <p className="hn-ps-empty">{t.hint}</p>
          )}

          {panelFloors.length > 1 && (
            <>
              <input
                type="range"
                className="hn-ps-slider"
                min={0}
                max={panelFloors.length - 1}
                step={1}
                value={Math.max(sliderIndex, 0)}
                aria-label={t.level}
                onChange={(e) => { setFollow(true); select(panelBuilding.id, panelFloors[Number(e.target.value)]); }}
              />
              <div className="hn-ps-range">
                <span>{panelFloors[0]}</span>
                <span>{panelFloors[panelFloors.length - 1]}</span>
              </div>
            </>
          )}

          <button
            type="button"
            className="hn-ps-cta"
            disabled={!lit || !litInfo || litInfo.lobby}
            onClick={() => lit && startPick(lit.buildingId, lit.floor)}
          >
            {t.cta}
          </button>
        </aside>
      )}
    </div>
  );
}
