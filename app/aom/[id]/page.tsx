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

const VirtualTour = dynamic(
  () => import("./VirtualTour").then((m) => ({ default: m.VirtualTour })),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: 520, background: "#1A1916", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#9A958F", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.75rem", letterSpacing: "0.06em" }}>
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
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VprPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

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
      <div style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#9A958F", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>Loading…</span>
      </div>
    );
  }

  // ── Not found ──
  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAF8F4", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "#6B6860", fontSize: "0.9375rem" }}>Property not found.</p>
        <Link href="/results" style={{ color: "#1F4B4A", fontWeight: 700, textDecoration: "none" }}>← Back to results</Link>
      </div>
    );
  }

  const attrs = (() => { try { return JSON.parse(unit.attributes) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })();
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
    <div style={{ minHeight: "100vh", background: "#FAF8F4", fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }}>

      {/* Subtle background glow */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(60% 40% at 85% 5%, rgba(47,102,100,0.07) 0%, transparent 55%), radial-gradient(40% 30% at 5% 85%, rgba(200,155,60,0.05) 0%, transparent 55%)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(250,248,244,0.85)", backdropFilter: "blur(16px) saturate(1.3)", borderBottom: "1px solid rgba(28,27,25,0.07)" }}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "1.125rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/haveniq_logo_horizontal.png" alt="Haveniq" style={{ height: 26, width: "auto" }} />
          </Link>
          <Link href="/results" style={{ textDecoration: "none", fontSize: "0.8125rem", fontWeight: 600, color: "#55534C", background: "none", border: "1px solid rgba(28,27,25,0.15)", borderRadius: 999, padding: "0.4rem 1rem" }}>
            ← Back to results
          </Link>
        </div>
      </nav>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "56rem", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

        {/* ── Property header ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "#1F4B4A", marginBottom: "0.5rem" }}>
            {unit.project.name} · {unit.project.location}
          </div>
          <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "2.25rem", fontWeight: 800, color: "#14130F", margin: "0 0 0.5rem", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
            {unit.unitLabel}
          </h1>
          {unit.description && (
            <p style={{ margin: 0, fontSize: "1rem", color: "#6B6860", lineHeight: 1.6, maxWidth: "40rem" }}>{unit.description}</p>
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
                  background: sibling.id === id ? "#1F4B4A" : "#F0EDE8",
                  color: sibling.id === id ? "#fff" : "#55534C",
                  border: sibling.id === id ? "none" : "1px solid rgba(28,27,25,0.12)",
                }}
              >
                {sibling.unitLabel}
              </Link>
            ))}
          </div>
        )}

        {/* ── Project teaser video (developer only) ────────────────────────── */}
        {unit.ownerType === "developer" && videoData && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 800, color: "#14130F", margin: "0 0 0.875rem", letterSpacing: "-0.01em" }}>
              Project Video
            </h2>
            <video
              controls
              style={{ width: "100%", borderRadius: 14, maxHeight: 480, background: "#1A1916", display: "block" }}
              src={videoData}
            />
          </section>
        )}

        {/* ── 360° Virtual Tour ────────────────────────────────────────────── */}
        {tourScenes.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem" }}>
              <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 800, color: "#14130F", margin: 0, letterSpacing: "-0.01em" }}>
                360° Virtual Tour
              </h2>
              <span style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", borderRadius: 999, padding: "0.2rem 0.625rem", fontFamily: "var(--font-jetbrains, monospace)" }}>
                {tourScenes.length} {tourScenes.length === 1 ? "room" : "rooms"}
              </span>
            </div>
            <VirtualTour scenes={tourScenes} />
          </section>
        )}

        {/* ── Gallery ──────────────────────────────────────────────────────── */}
        {tourScenes.length === 0 && galleryImages.length > 0 && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 800, color: "#14130F", margin: "0 0 0.875rem", letterSpacing: "-0.01em" }}>
              Photos
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
              {galleryImages.map(img => (
                <div key={img.id} style={{ borderRadius: "0.625rem", overflow: "hidden", border: "1px solid rgba(28,27,25,0.08)", aspectRatio: "4/3", background: "#F0EDE8" }}>
                  <img src={img.imageData} alt={img.label || "Property photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Floor Plan ───────────────────────────────────────────────────── */}
        {floorplanImage && (
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 800, color: "#14130F", margin: "0 0 0.875rem", letterSpacing: "-0.01em" }}>
              Floor Plan
            </h2>
            <img
              src={floorplanImage.imageData}
              alt="Floor plan"
              style={{ width: "100%", borderRadius: 14, border: "1px solid rgba(28,27,25,0.08)" }}
            />
          </section>
        )}

        {/* ── Details card ─────────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.04), 0 24px 48px -20px rgba(18,51,50,0.10)", overflow: "hidden", marginBottom: "1.25rem" }}>
          <div style={{ height: 4, background: "linear-gradient(90deg, #C89B3C, #A07830)" }} />
          <div style={{ padding: "1.75rem" }}>
            <h3 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 800, color: "#14130F", margin: "0 0 1.25rem", letterSpacing: "-0.01em" }}>
              Match parameters
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
              {unit.price > 0 && (
                <div>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.25rem" }}>Listed price</div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#14130F", fontFamily: "var(--font-jetbrains, monospace)" }}>£{unit.price.toLocaleString()}</div>
                </div>
              )}
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.25rem" }}>Seller min (eil)</div>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1F4B4A", fontFamily: "var(--font-jetbrains, monospace)" }}>{unit.eil}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.25rem" }}>Seller target (ail)</div>
                <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#1F4B4A", fontFamily: "var(--font-jetbrains, monospace)" }}>{unit.ail}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.25rem" }}>Availability</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "#14130F" }}>{unit.quantityAvailable} / {unit.quantityTotal} units</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Attributes card ──────────────────────────────────────────────── */}
        {Object.keys(attrs).length > 0 && (
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(28,27,25,0.08)", boxShadow: "0 2px 4px rgba(28,27,25,0.04)", padding: "1.75rem" }}>
            <h3 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 800, color: "#14130F", margin: "0 0 1rem", letterSpacing: "-0.01em" }}>
              Features
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {Object.entries(attrs).map(([k, v]) => (
                <span key={k} style={{ fontSize: "0.8125rem", background: "#F5F3EE", color: "#55534C", borderRadius: 8, padding: "0.3125rem 0.75rem", border: "1px solid rgba(28,27,25,0.08)", fontWeight: 500 }}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
