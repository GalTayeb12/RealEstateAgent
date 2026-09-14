import Link from "next/link";

export default function DevRejectedPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#F7F5F1", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "var(--font-inter, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #DDD9D3", borderTop: "4px solid #B04040", overflow: "hidden" }}>
          <div style={{ padding: "2.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div>
              <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.5rem" }}>
                Haveniq — Developer Portal
              </div>
              <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0, lineHeight: 1.2 }}>
                Verification unsuccessful
              </h1>
            </div>

            <div style={{ background: "#FAE8E8", borderRadius: "0.625rem", padding: "1rem 1.125rem" }}>
              <p style={{ margin: 0, fontSize: "0.9375rem", color: "#1C1B19", lineHeight: 1.55 }}>
                We were unable to verify your company registration details against the companies registry. This may be due to a mismatch in the CRN, company name, or a requirement for additional documentation.
              </p>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "#6B6860", lineHeight: 1.6 }}>
              Please contact our support team to understand what information is needed or to resubmit your application.
            </p>

            <a
              href="mailto:galta851@gmail.com"
              style={{
                display: "block", textAlign: "center", padding: "0.875rem",
                background: "#1F4B4A", color: "#fff", borderRadius: "0.5rem",
                fontSize: "0.9375rem", fontWeight: 600, textDecoration: "none",
              }}
            >
              Contact support
            </a>

            <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>
              <Link href="/dev/register" style={{ color: "#1F4B4A", fontWeight: 600 }}>Register with different details</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
