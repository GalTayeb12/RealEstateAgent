import Link from "next/link";

// Consistent prose styles (same palette as terms/page.tsx)
const S = {
  page: {
    minHeight: "100vh",
    background: "#FAF8F4",
    fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
  } as React.CSSProperties,
  glow: {
    position: "fixed" as const,
    inset: 0,
    background:
      "radial-gradient(60% 40% at 85% 5%, rgba(47,102,100,0.06) 0%, transparent 55%), " +
      "radial-gradient(40% 30% at 5% 85%, rgba(200,155,60,0.04) 0%, transparent 55%)",
    pointerEvents: "none" as const,
    zIndex: 0,
  },
  wrap: {
    position: "relative" as const,
    zIndex: 1,
    maxWidth: "44rem",
    margin: "0 auto",
    padding: "4rem 1.5rem 6rem",
  },
  eyebrow: {
    fontFamily: "var(--font-jetbrains, monospace)",
    fontSize: "0.6875rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#1F4B4A",
    marginBottom: "0.875rem",
    display: "block",
  },
  h1: {
    fontFamily: "var(--font-fraunces, serif)",
    fontSize: "2.5rem",
    fontWeight: 800,
    color: "#14130F",
    margin: "0 0 0.5rem",
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
  } as React.CSSProperties,
  meta: {
    fontFamily: "var(--font-jetbrains, monospace)",
    fontSize: "0.6875rem",
    letterSpacing: "0.06em",
    color: "#9A958F",
    marginBottom: "3rem",
    display: "block",
  },
  h2: {
    fontSize: "0.8125rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#1F4B4A",
    margin: "0 0 0.75rem",
    fontFamily: "var(--font-inter, sans-serif)",
  } as React.CSSProperties,
  section: {
    marginTop: "2.5rem",
    paddingTop: "2rem",
    borderTop: "1px solid rgba(28,27,25,0.07)",
  },
  p: {
    margin: "0 0 0.875rem",
    fontSize: "0.9375rem",
    color: "#3A3733",
    lineHeight: 1.75,
  } as React.CSSProperties,
  ul: {
    margin: "0.25rem 0 0.875rem",
    paddingLeft: "1.375rem",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "0.5rem",
  } as React.CSSProperties,
  li: {
    fontSize: "0.9375rem",
    color: "#3A3733",
    lineHeight: 1.7,
  } as React.CSSProperties,
  strong: {
    color: "#1C1B19",
    fontWeight: 700,
  } as React.CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#6B6860",
    textDecoration: "none" as const,
    marginBottom: "2.5rem",
  },
  callout: {
    background: "#F5F3EE",
    borderRadius: 10,
    padding: "0.875rem 1.125rem",
    fontSize: "0.9375rem",
    color: "#3A3733",
    lineHeight: 1.75,
    margin: "0 0 0.875rem",
    borderLeft: "3px solid #1F4B4A",
  } as React.CSSProperties,
};

export default function PrivacyPage() {
  return (
    <div style={S.page}>
      <div style={S.glow} />
      <div style={S.wrap}>

        <Link href="/" style={S.back}>← Back to Haveniq</Link>

        <span style={S.eyebrow}>Legal</span>
        <h1 style={S.h1}>Privacy Policy</h1>
        <span style={S.meta}>Last updated: September 2026</span>

        {/* 1 — Overview */}
        <p style={S.p}>
          This Privacy Policy explains how Haveniq ("we," "us," "our") collects, uses, and shares
          information when you use our platform (the "Platform"). By using the Platform, you consent
          to the practices described here.
        </p>

        {/* 2 — What we collect */}
        <div style={S.section}>
          <h2 style={S.h2}>2. Information We Collect</h2>

          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            <strong style={S.strong}>Account information:</strong>{" "}
            email address, name, phone number, password (stored securely), and — for Developers —
            company name, registration number, and contact details.
          </p>

          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            <strong style={S.strong}>Interview data:</strong>{" "}
            when you participate in the AI-assisted Interview, we collect and process:
          </p>
          <ul style={S.ul}>
            <li style={S.li}>Audio and, where applicable, video of your side of the conversation.</li>
            <li style={S.li}>A text transcript generated from that conversation.</li>
            <li style={S.li}>
              A structured preference profile derived from the transcript (e.g., budget range,
              location preferences, timeline, family situation, and other criteria you share).
            </li>
          </ul>

          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            <strong style={S.strong}>Transaction and negotiation data:</strong>{" "}
            offers submitted, prices proposed or countered, messages and status changes within the
            Deal Room, and records of any digital signature steps you complete (including the
            signature image and typed name you provide).
          </p>

          <p style={{ ...S.p, marginBottom: 0 }}>
            <strong style={S.strong}>Usage data:</strong>{" "}
            log data such as login timestamps, pages visited, and actions taken within the Platform,
            used for security, rate-limiting, and service improvement.
          </p>
        </div>

        {/* 3 — How we use */}
        <div style={S.section}>
          <h2 style={S.h2}>3. How We Use Your Information</h2>
          <p style={{ ...S.p, marginBottom: "0.375rem" }}>We use your information to:</p>
          <ul style={S.ul}>
            <li style={S.li}>
              Operate the matching engine and generate relevant property matches.
            </li>
            <li style={S.li}>
              Facilitate communication and negotiation between Buyers and Developers.
            </li>
            <li style={S.li}>
              Verify Developer identity and approve Developer accounts.
            </li>
            <li style={S.li}>
              Maintain the security and integrity of the Platform, including enforcing usage limits
              designed to prevent abuse.
            </li>
            <li style={S.li}>
              Improve and troubleshoot the Interview and matching features.
            </li>
          </ul>
        </div>

        {/* 4 — Sharing */}
        <div style={S.section}>
          <h2 style={S.h2}>4. Sharing Your Information</h2>

          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            <strong style={S.strong}>With other users:</strong>{" "}
            when you submit or receive an offer, certain information (such as your email address,
            offered price, and stated preferences) is shared with the other party to that specific
            transaction so the deal can proceed.
          </p>

          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            <strong style={S.strong}>With service providers:</strong>{" "}
            we use third-party providers to operate core features of the Platform, including:
          </p>
          <ul style={S.ul}>
            <li style={S.li}>
              Conversational AI and voice processing providers, to conduct and transcribe the Interview.
            </li>
            <li style={S.li}>
              Avatar video rendering providers, to power the visual AI Avatar experience.
            </li>
            <li style={S.li}>
              Language-model providers, to analyze Interview transcripts and generate structured
              preference profiles.
            </li>
            <li style={S.li}>
              Cloud database and hosting providers, to store and serve Platform data.
            </li>
          </ul>
          <p style={{ ...S.p, marginBottom: "0.875rem" }}>
            These providers process data on our behalf and are contractually and technically
            restricted from using it for purposes other than providing their service to us.
          </p>

          <p style={{ ...S.p, marginBottom: "0.875rem" }}>
            <strong style={S.strong}>Legal requirements:</strong>{" "}
            we may disclose information if required by law, regulation, or valid legal process.
          </p>

          <div style={S.callout}>
            We do not sell your personal information to third parties.
          </div>
        </div>

        {/* 5 — Retention */}
        <div style={S.section}>
          <h2 style={S.h2}>5. Data Retention</h2>
          <p style={S.p}>
            We retain account and Interview data for as long as your account is active, and for a
            reasonable period afterward to comply with legal obligations, resolve disputes, and
            enforce our agreements. You may request deletion of your account and associated data
            as described below.
          </p>
        </div>

        {/* 6 — Rights */}
        <div style={S.section}>
          <h2 style={S.h2}>6. Your Rights</h2>
          <p style={{ ...S.p, marginBottom: "0.375rem" }}>
            Subject to applicable law, you may request to:
          </p>
          <ul style={S.ul}>
            <li style={S.li}>Access the personal information we hold about you.</li>
            <li style={S.li}>
              Correct inaccurate information (many fields are editable directly from your Profile
              page).
            </li>
            <li style={S.li}>Request deletion of your account and associated data.</li>
          </ul>
          <p style={S.p}>
            To exercise these rights, contact us using the support address listed in the app.
          </p>
        </div>

        {/* 7 — Security */}
        <div style={S.section}>
          <h2 style={S.h2}>7. Security</h2>
          <p style={S.p}>
            We use reasonable technical and organizational measures to protect your information,
            including encrypted password storage and access controls. However, no system is
            completely secure, and we cannot guarantee absolute security of your data.
          </p>
        </div>

        {/* 8 — Children */}
        <div style={S.section}>
          <h2 style={S.h2}>8. Children&apos;s Privacy</h2>
          <p style={S.p}>
            The Platform is not directed to individuals under 18, and we do not knowingly collect
            personal information from minors.
          </p>
        </div>

        {/* 9 — Changes */}
        <div style={S.section}>
          <h2 style={S.h2}>9. Changes to This Policy</h2>
          <p style={S.p}>
            We may update this Privacy Policy from time to time. Material changes will be reflected
            by updating the "Last updated" date above.
          </p>
        </div>

        {/* 10 — Contact */}
        <div style={S.section}>
          <h2 style={S.h2}>10. Contact</h2>
          <p style={S.p}>
            Questions about this Privacy Policy can be directed to our support address listed in
            the app.
          </p>
        </div>

      </div>
    </div>
  );
}
