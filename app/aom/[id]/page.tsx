"use client";
/**
 * /aom/[id] — Virtual Property Review (VPR) page
 *
 * Data-driven rendering:
 *   - If the listing has panorama images → renders the 360° Pannellum tour.
 *   - Else if it has gallery images → renders a photo grid.
 *   - Otherwise → property details only.
 *
 * VirtualTour is loaded client-side only (ssr: false) because Pannellum uses
 * WebGL/Canvas APIs that don't exist in Node.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { TourScene } from "./VirtualTour";
import { useI18n } from "@/components/LocaleProvider";
import type { ExplorerBuilding } from "@/components/building/types";
import { illustrativeImage } from "@/lib/illustrative";
import "./aom-hero.css";
import { parseAttributes, roomsOf } from "@/lib/attributes";

const BuildingExplorer = dynamic(() => import("@/components/building/BuildingExplorer"), {
  ssr: false,
  loading: () => <div style={{ height: 560, borderRadius: 16, background: "var(--qp-soft)", marginBottom: "2rem" }} />,
});

const VirtualTour = dynamic(
  () => import("./VirtualTour").then((m) => ({ default: m.VirtualTour })),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 520, background: "var(--qp-soft)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--qp-muted)", fontFamily: "var(--font-heebo), sans-serif", fontSize: "0.875rem" }}>
          Loading tour…
        </span>
      </div>
    ),
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListingImage {
  id: string;
  type: "gallery" | "panorama" | "floorplan";
  label: string;
  imageData: string;
  order: number;
}

interface SiblingUnitType {
  id: string;
  unitLabel: string;
  ownerType: string;
  price: number;
  attributes: string;
}

interface UnitDetail {
  id: string;
  unitLabel: string;
  price: number;
  priceFrom?: boolean;
  quantityAvailable: number;
  quantityTotal: number;
  description: string;
  eil: number;
  ail: number;
  aomStatus: string;
  attributes: string;
  ownerType: string;
  hasTeaserVideo: boolean;
  project: {
    id: string;
    name: string;
    location: string;
    unitTypes: SiblingUnitType[];
  };
  seller: { email: string };
  images: ListingImage[];
  buildings?: ExplorerBuilding[];
}

/**
 * Fixed back pill. Returns to wherever the buyer came from (results, offers, a group...), else to /results.
 * The 3D explorer pushes history entries while browsing floors/units, so a plain router.back() would only
 * step through those; we count the entries added since this page opened and go back past all of them.
 */
function BackButton({ label, inNav }: { label: string; inNav?: boolean }) {
  const router = useRouter();
  const base = useRef<number | null>(null);
  useEffect(() => { base.current = window.history.length; }, []);
  function goBack() {
    const start = base.current;
    if (start == null || start <= 1) { router.push("/results"); return; }
    const added = Math.max(0, window.history.length - start);
    window.history.go(-(added + 1));
  }
  return (
    <button type="button" className={inNav ? "av-backbtn in-nav" : "av-backbtn"} onClick={goBack}>
      <span aria-hidden="true" className="av-arrow">←</span>{label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VprPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { m, locale } = useI18n();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Buyer's minimum rooms: apartment-type tabs below it are dimmed, not hidden

  // Lazy-loaded teaser video
  const [videoData, setVideoData] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/aom/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (d?.unit) setUnit(d.unit);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [id]);

  // Fetch teaser video lazily once unit is loaded
  useEffect(() => {
    if (!unit || !id) return;
    if (unit.ownerType === "developer" && unit.hasTeaserVideo) {
      fetch(`/api/aom/${id}/video`)
        .then(r => r.json())
        .then(d => setVideoData(d.videoData ?? null))
        .catch(() => { /* silently ignore */ });
    }
  }, [unit, id]);

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--qp-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--qp-muted)", fontFamily: "var(--font-heebo, monospace)", fontSize: "0.8125rem" }}>{m.unitView.loading}</span>
      </div>
    );
  }

  // ── Not found ──
  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--qp-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "var(--qp-muted)", fontSize: "0.9375rem" }}>{m.unitView.notFound}</p>
        <Link href="/results" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.unitView.backToResults}</Link>
      </div>
    );
  }

  const panoramaImages = unit.images.filter(img => img.type === "panorama").sort((a, b) => a.order - b.order);
  const galleryImages  = unit.images.filter(img => img.type === "gallery").sort((a, b) => a.order - b.order);
  const floorplanImage = unit.images.find(img => img.type === "floorplan") ?? null;

  const tourScenes: TourScene[] = panoramaImages.map(img => ({
    id:          img.id,
    label:       img.label || `Room ${img.order + 1}`,
    panoramaUrl: img.imageData,
  }));

  // Sibling unit types (developer only, other active units in same project)
  const siblingTypes = unit.ownerType === "developer"
    ? (unit.project.unitTypes ?? [])
        .filter(ut => ut.ownerType === "developer")
        .map(ut => ({ ...ut, rooms: roomsOf(parseAttributes(ut.attributes), ut.unitLabel) }))
        .sort((a, b) => (a.rooms ?? 99) - (b.rooms ?? 99))
    : [];
  // A project page: project name on top, one tab per apartment type
  const asProject = unit.ownerType === "developer" && siblingTypes.length > 1;

  const hasExplorer = unit.ownerType === "developer" && (unit.buildings?.length ?? 0) > 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--qp-bg)", fontFamily: "var(--font-heebo, sans-serif)" }}>

      <BackButton label={locale === "he" ? "חזרה" : "Back"} inNav={hasExplorer} />

      {/* ── Photographic hero (V3) when there is no 3D building ─────────── */}
      {!hasExplorer && (
        <section className="av-hero">
          <Image src={illustrativeImage(unit.id)} alt="" fill priority sizes="100vw" />
          <div className="av-shade" />
          <div className="av-in">
            <span className="av-kick">{unit.project.name} · {unit.project.location}</span>
            <h1>{asProject ? unit.project.name : unit.unitLabel}</h1>
            {!asProject && unit.description && <p>{unit.description}</p>}
            <small>{locale === "he" ? "התמונה להמחשה בלבד · הדמיה" : "Illustrative rendering"}</small>
          </div>
        </section>
      )}

      {/* ── Building hero: full-bleed, nav floats over it ───────────────── */}
      {unit.ownerType === "developer" && (unit.buildings?.length ?? 0) > 0 && (
        <BuildingExplorer buildings={unit.buildings ?? []} activeUnitTypeId={unit.id} />
      )}

      <div style={{ position: "relative", zIndex: 1, maxWidth: "75rem", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>

        {/* ── Project teaser video (developer only) ────────────────────────── */}
        {unit.ownerType === "developer" && videoData && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.875rem", letterSpacing: "0" }}>
              {m.unitView.projectVideo}
            </h2>
            <video
              controls
              style={{ width: "100%", borderRadius: 14, maxHeight: 480, background: "var(--qp-soft)", display: "block" }}
              src={videoData}
            />
          </section>
        )}

        {/* ── 360° Virtual Tour ────────────────────────────────────────────── */}
        {tourScenes.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem" }}>
              <h2 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: 0, letterSpacing: "0" }}>
                360° Virtual Tour
              </h2>
              <span style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--qp-ink)", color: "var(--qp-on-primary)", borderRadius: 999, padding: "0.2rem 0.625rem", fontFamily: "var(--font-heebo, monospace)" }}>
                {tourScenes.length} {tourScenes.length === 1 ? "room" : "rooms"}
              </span>
            </div>
            <VirtualTour scenes={tourScenes} />
          </section>
        )}

        {/* ── Gallery ──────────────────────────────────────────────────────── */}
        {tourScenes.length === 0 && galleryImages.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.875rem", letterSpacing: "0" }}>
              Photos
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
              {galleryImages.map(img => (
                <div key={img.id} style={{ borderRadius: "0.625rem", overflow: "hidden", border: "1px solid rgba(18,63,64,0.08)", aspectRatio: "4/3", background: "var(--qp-soft)" }}>
                  <img src={img.imageData} alt={img.label || "Property photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Floor Plan ───────────────────────────────────────────────────── */}
        {floorplanImage && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.875rem", letterSpacing: "0" }}>
              {m.unitView.floorPlan}
            </h2>
            <img
              src={floorplanImage.imageData}
              alt={m.unitView.floorPlan}
              style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)" }}
            />
          </section>
        )}
      </div>
    </div>
  );
}
