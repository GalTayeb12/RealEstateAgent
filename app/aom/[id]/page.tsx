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

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { TourScene } from "./VirtualTour";
import { EstimatedPriceNote, Money } from "@/components/Money";
import { useI18n } from "@/components/LocaleProvider";
import type { ExplorerBuilding } from "@/components/building/types";
import { formatAttributeValue, parseAttributes } from "@/lib/attributes";
import { MortgageCalculator } from "@/components/MortgageCalculator";

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VprPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { m } = useI18n();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
        <span style={{ color: "var(--qp-muted)", fontFamily: "var(--font-heebo, monospace)", fontSize: "0.8125rem" }}>Loading…</span>
      </div>
    );
  }

  // ── Not found ──
  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--qp-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "var(--qp-muted)", fontSize: "0.9375rem" }}>Property not found.</p>
        <Link href="/results" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>← Back to results</Link>
      </div>
    );
  }

  const attrs = parseAttributes(unit.attributes);
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
    ? (unit.project.unitTypes ?? []).filter(ut => ut.ownerType === "developer")
    : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--qp-bg)", fontFamily: "var(--font-heebo, sans-serif)" }}>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "75rem", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
        <p style={{ margin: "0 0 1.25rem" }}>
          <Link href="/results" style={{ color: "var(--qp-ink)", fontWeight: 500, textDecoration: "none" }}>Back to results</Link>
        </p>

        {/* ── Property header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: "var(--font-heebo, monospace)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "var(--qp-ink)", marginBottom: "0.5rem" }}>
            {unit.project.name} · {unit.project.location}
          </div>
          <h1 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "2.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.5rem", lineHeight: 1.15, letterSpacing: "0" }}>
            {unit.unitLabel}
          </h1>
          {unit.description && (
            <p style={{ margin: 0, fontSize: "1rem", color: "var(--qp-muted)", lineHeight: 1.6, maxWidth: "40rem" }}>{unit.description}</p>
          )}
        </div>

        {/* ── Sibling unit type picker (developer only, > 1 type) ──────────── */}
        {unit.ownerType === "developer" && siblingTypes.length > 1 && (
          <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {siblingTypes.map(sibling => (
              <Link
                key={sibling.id}
                href={`/aom/${sibling.id}`}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: 999,
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  background: sibling.id === id ? "var(--qp-ink)" : "var(--qp-soft)",
                  color: sibling.id === id ? "var(--qp-on-primary)" : "var(--qp-muted)",
                  border: sibling.id === id ? "none" : "1px solid rgba(18,63,64,0.12)",
                }}
              >
                {sibling.unitLabel}
              </Link>
            ))}
          </div>
        )}

        {unit.ownerType === "developer" && (unit.buildings?.length ?? 0) > 0 && (
          <BuildingExplorer buildings={unit.buildings ?? []} activeUnitTypeId={unit.id} />
        )}

        {/* ── Project teaser video (developer only) ────────────────────────── */}
        {unit.ownerType === "developer" && videoData && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.25rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.875rem", letterSpacing: "0" }}>
              Project Video
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
              Floor Plan
            </h2>
            <img
              src={floorplanImage.imageData}
              alt="Floor plan"
              style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(18,63,64,0.08)" }}
            />
          </section>
        )}

        {/* ── Details card ─────────────────────────────────────────────────── */}
        <div style={{ background: "var(--qp-surface)", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04), 0 24px 48px -20px rgba(18,51,50,0.10)", overflow: "hidden", marginBottom: "1.25rem" }}>
          <div style={{ height: 4, background: "var(--qp-accent)" }} />
          <div style={{ padding: "1.75rem" }}>
            <h3 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.125rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 1.25rem", letterSpacing: "0" }}>
              Match parameters
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
              {unit.price > 0 && (
                <div>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", marginBottom: "0.25rem" }}>Listed price</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--qp-ink)", fontFamily: "var(--font-heebo, monospace)" }}>{unit.priceFrom ? `${m.results.from} ` : ""}<Money amount={unit.price} /><EstimatedPriceNote /></div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", marginBottom: "0.25rem" }}>Seller min (eil)</div>
                <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--qp-ink)", fontFamily: "var(--font-heebo, monospace)" }}>{unit.eil}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", marginBottom: "0.25rem" }}>Seller target (ail)</div>
                <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--qp-ink)", fontFamily: "var(--font-heebo, monospace)" }}>{unit.ail}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--qp-muted)", marginBottom: "0.25rem" }}>Availability</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--qp-ink)" }}>{unit.quantityAvailable} / {unit.quantityTotal} units</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Attributes card ──────────────────────────────────────────────── */}
        {Object.keys(attrs).length > 0 && (
          <div style={{ background: "var(--qp-surface)", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04)", padding: "1.75rem" }}>
            <h3 style={{ fontFamily: "var(--font-heebo, serif)", fontSize: "1.125rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 1rem", letterSpacing: "0" }}>
              Features
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {Object.entries(attrs).map(([k, v]) => {
                const text = formatAttributeValue(v);
                if (!text) return null;
                return (
                  <span key={k} style={{ fontSize: "0.8125rem", background: "var(--qp-soft)", color: "var(--qp-ink)", borderRadius: 8, padding: "0.3125rem 0.75rem", border: "1px solid var(--qp-border)", fontWeight: 500 }}>
                    {k}: {text}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Mini mortgage calculator ──────────────────────────────────────── */}
        {unit.price > 0 && (
          <MortgageCalculator mini price={unit.price} />
        )}
      </div>
    </div>
  );
}
