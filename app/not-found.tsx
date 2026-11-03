import Link from "next/link";
import Image from "next/image";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--qp-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", fontFamily: "var(--font-heebo, sans-serif)" }}>
      <div style={{ position: "relative", width: "min(480px, 100%)", aspectRatio: "4/3", borderRadius: "1.25rem", overflow: "hidden", marginBottom: "2.5rem", boxShadow: "0 8px 48px rgba(18,63,64,0.10)" }}>
        <Image
          src="/images/404.jpg"
          alt=""
          fill
          sizes="(max-width: 600px) 100vw, 480px"
          style={{ objectFit: "cover" }}
          priority
        />
      </div>
      <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--qp-accent-text)" }}>404</p>
      <h1 style={{ margin: "0 0 0.75rem", fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 300, color: "var(--qp-ink)", lineHeight: 1.2 }}>
        הדף לא נמצא
      </h1>
      <p style={{ margin: "0 0 2rem", fontSize: "1rem", color: "var(--qp-muted)", maxWidth: "32rem", lineHeight: 1.65 }}>
        ייתכן שהקישור שגוי, או שהדף הוסר. חזרו לדף הבית כדי להמשיך.
      </p>
      <Link
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 2rem", background: "var(--qp-ink)", color: "var(--qp-on-primary)", borderRadius: "0.5rem", fontWeight: 500, fontSize: "0.9375rem", textDecoration: "none", transition: "background 0.15s" }}
      >
        חזרה לדף הבית
      </Link>
    </main>
  );
}
