import Link from "next/link";

const C = [
  { k: "c3", t: "C v3 · homepage refinement", d: "Calm architectural hero, 3D building miniature, interior-to-plan apartment preview. V2 buyer and developer screens unchanged." },
  { k: "c2", t: "C v2 · Cinematic Living (chosen direction)", d: "Refined: serif display, scroll story with time-of-day, interactive facade where floors light up, full-screen apartment tour, buyer results with tunable score, developer dashboard on the same building." },
  { k: "a", t: "A · Architectural Editorial", d: "Paper, hairlines, serif display. Calm, authoritative, print-grade." },
  { k: "b", t: "B · Spatial Intelligence", d: "Product-forward. Split panes, score breakdowns, inventory heatmap." },
  { k: "c", t: "C · Cinematic Living", d: "Dark, immersive. Scroll-driven day-to-night, full-bleed imagery." },
];
export default function Index() {
  return (
    <main style={{ background: "#f4f1ea", color: "#14201f", minHeight: "100%", padding: "64px 24px", fontFamily: "var(--dl-heebo), sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <p style={{ font: "500 12px var(--dl-mono)", letterSpacing: ".08em", textTransform: "uppercase" }}>Haveniq · Design Lab · prototypes (sample data)</p>
        <h1 style={{ fontFamily: "var(--dl-frank)", fontWeight: 400, fontSize: 48, margin: "12px 0 32px" }}>Three directions</h1>
        {C.map((c) => (
          <div key={c.k} style={{ borderTop: "1px solid #14201f33", padding: "24px 0", display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontWeight: 500 }}>{c.t}</h2><p style={{ margin: 0, opacity: .7 }}>{c.d}</p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 15 }}>
              {["", "/results", "/developer"].map((p) => ["he", "en"].map((l) => (
                <Link key={p + l} href={`/design-lab/${c.k}${p}?lang=${l}`} style={{ textDecoration: "underline" }}>{(p || "home").replace("/", "")} · {l}</Link>
              )))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
