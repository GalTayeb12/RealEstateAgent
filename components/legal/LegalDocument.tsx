import Link from "next/link";
import type { LegalDoc } from "@/lib/legal/content";

const S = {
  page: { minHeight: "100vh", background: "var(--qp-bg)", fontFamily: "var(--font-heebo, sans-serif)" } as React.CSSProperties,
  wrap: { position: "relative" as const, zIndex: 1, maxWidth: "44rem", margin: "0 auto", padding: "4rem 1.5rem 6rem" },
  eyebrow: { fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--qp-ink)", marginBottom: "0.875rem", display: "block" },
  h1: { fontSize: "2.5rem", fontWeight: 500, color: "var(--qp-ink)", margin: "0 0 0.5rem", lineHeight: 1.15 } as React.CSSProperties,
  meta: { fontSize: "0.75rem", color: "var(--qp-muted)", marginBottom: "1.5rem", display: "block" },
  notice: { background: "var(--qp-warning-bg)", color: "var(--qp-accent-text)", borderRadius: 10, padding: "0.875rem 1.125rem", fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "2rem", borderInlineStart: "3px solid var(--qp-accent-text)" } as React.CSSProperties,
  h2: { fontSize: "0.9375rem", fontWeight: 600, color: "var(--qp-ink)", margin: "0 0 0.75rem" } as React.CSSProperties,
  section: { marginTop: "2.25rem", paddingTop: "1.75rem", borderTop: "1px solid rgba(18,63,64,0.08)" },
  p: { margin: "0 0 0.875rem", fontSize: "0.9375rem", color: "var(--qp-ink)", lineHeight: 1.75 } as React.CSSProperties,
  ul: { margin: "0.25rem 0 0.875rem", paddingInlineStart: "1.375rem", display: "flex", flexDirection: "column" as const, gap: "0.5rem" } as React.CSSProperties,
  li: { fontSize: "0.9375rem", color: "var(--qp-ink)", lineHeight: 1.7 } as React.CSSProperties,
  back: { display: "inline-flex", fontSize: "0.875rem", fontWeight: 600, color: "var(--qp-muted)", textDecoration: "none", marginBottom: "2.5rem" },
};

/** Renders text with <a href="/x">label</a> segments as in-app links. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(<a href="[^"]+">[^<]*<\/a>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^<a href="([^"]+)">([^<]*)<\/a>$/);
        if (match) {
          return (
            <Link key={i} href={match[1]} style={{ color: "var(--qp-ink)", fontWeight: 600 }}>
              {match[2]}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function LegalDocument({ doc, backHref = "/" }: { doc: LegalDoc; backHref?: string }) {
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <Link href={backHref} style={S.back}>← {doc.back}</Link>
        <span style={S.eyebrow}>{doc.eyebrow}</span>
        <h1 style={S.h1}>{doc.title}</h1>
        <span style={S.meta}>{doc.updated}</span>
        <div role="note" style={S.notice}>{doc.draftNotice}</div>

        {doc.intro.map((t, i) => (
          <p key={`i${i}`} style={S.p}><Rich text={t} /></p>
        ))}

        {doc.sections.map((sec) => (
          <section key={sec.h} style={S.section}>
            <h2 style={S.h2}>{sec.h}</h2>
            {sec.p?.map((t, i) => (
              <p key={i} style={S.p}><Rich text={t} /></p>
            ))}
            {sec.ul && (
              <ul style={S.ul}>
                {sec.ul.map((t, i) => (
                  <li key={i} style={S.li}><Rich text={t} /></li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section style={S.section}>
          <h2 style={S.h2}>{doc.contactLabel}</h2>
          <p style={S.p}>
            <a href={`mailto:${doc.contactEmail}`} style={{ color: "var(--qp-ink)", fontWeight: 600 }}>{doc.contactEmail}</a>
          </p>
        </section>
      </div>
    </div>
  );
}
