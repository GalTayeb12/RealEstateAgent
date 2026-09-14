import Link from "next/link";

// Consistent prose styles
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
    margin: "0 0 0.875rem",
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
};

export default function TermsPage() {
  return (
    <div style={S.page}>
      <div style={S.glow} />
      <div style={S.wrap}>

        <Link href="/" style={S.back}>← Back to Haveniq</Link>

        <span style={S.eyebrow}>Legal</span>
        <h1 style={S.h1}>Terms of Service</h1>
        <span style={S.meta}>Last updated: September 2026</span>

        {/* Intro */}
        <p style={S.p}>
          Haveniq ("we," "us," "our," or the "Platform") operates an online marketplace that connects
          prospective property buyers ("Buyers") with real estate developers and sellers ("Developers")
          in Israel, using an AI-assisted interview process to characterize Buyer preferences and match
          them with relevant property listings.
        </p>
        <p style={S.p}>
          By creating an account or otherwise using the Platform, you agree to these Terms of Service
          ("Terms"). If you do not agree, please do not use the Platform.
        </p>

        {/* 2 */}
        <div style={S.section}>
          <h2 style={S.h2}>2. Eligibility and Accounts</h2>
          <ul style={S.ul}>
            <li style={S.li}>You must be at least 18 years old to create an account.</li>
            <li style={S.li}>
              Buyers register with a valid email address and must verify that email before
              accessing matching features.
            </li>
            <li style={S.li}>
              Developers register with company and identifying information (including a company
              registration number) and are subject to a manual approval process before gaining
              access to the Developer dashboard. Haveniq reserves the right to approve, reject,
              or revoke Developer access at its discretion.
            </li>
            <li style={S.li}>
              You are responsible for maintaining the confidentiality of your account credentials
              and for all activity under your account.
            </li>
          </ul>
        </div>

        {/* 3 */}
        <div style={S.section}>
          <h2 style={S.h2}>3. The AI Interview and Matching Process</h2>
          <ul style={S.ul}>
            <li style={S.li}>
              Buyers participate in a guided, AI-assisted conversational interview (the "Interview")
              to help the Platform understand their property preferences, budget, timeline, and
              related criteria.
            </li>
            <li style={S.li}>
              The Interview may be conducted using synthetic voice and/or video (an "AI Avatar") and
              is transcribed and analyzed by AI systems, including third-party service providers, to
              produce a structured preference profile.
            </li>
            <li style={S.li}>
              The number of Interviews (including retakes) a Buyer may initiate within a given period
              may be limited by the Platform to ensure fair use and system stability.
            </li>
            <li style={S.li}>
              Matching results are generated algorithmically based on the information you provide
              and available listings.{" "}
              <strong style={S.strong}>
                Haveniq does not guarantee that any match, offer, or listing will meet your
                expectations, remain available, or result in a completed transaction.
              </strong>
            </li>
          </ul>
        </div>

        {/* 4 */}
        <div style={S.section}>
          <h2 style={S.h2}>4. Offers, Negotiation, and Deal Room</h2>
          <ul style={S.ul}>
            <li style={S.li}>
              Buyers may submit offers on listings; Developers may accept, reject, or counter
              such offers.
            </li>
            <li style={S.li}>
              Accepted offers proceed to a "Deal Room" where both parties can track deal status,
              including a simulated reservation deposit step and a digital contract-signing step.
            </li>
            <li style={S.li}>
              <strong style={S.strong}>
                Certain features of the Deal Room, including deposit payments and the signing flow,
                are currently simulated for demonstration purposes and do not constitute real
                financial transactions or legally binding agreements.
              </strong>{" "}
              Any document generated through the Platform's signing flow is provided for
              record-keeping and demonstration purposes only and should not be relied upon as a
              substitute for a properly executed, legally binding real estate contract prepared
              with independent legal counsel.
            </li>
            <li style={S.li}>
              Completion of any real estate transaction requires independent legal, financial, and
              regulatory steps outside the Platform, including engagement of a licensed conveyancing
              solicitor.
            </li>
          </ul>
        </div>

        {/* 5 */}
        <div style={S.section}>
          <h2 style={S.h2}>5. Developer Listings</h2>
          <ul style={S.ul}>
            <li style={S.li}>
              Developers are solely responsible for the accuracy of information, pricing,
              availability, and media (including photographs and virtual tours) they upload to
              the Platform.
            </li>
            <li style={S.li}>
              Haveniq does not independently verify listing accuracy and disclaims responsibility
              for errors, omissions, or outdated information in Developer-submitted content.
            </li>
          </ul>
        </div>

        {/* 6 */}
        <div style={S.section}>
          <h2 style={S.h2}>6. Acceptable Use</h2>
          <p style={{ ...S.p, marginBottom: "0.5rem" }}>You agree not to:</p>
          <ul style={S.ul}>
            <li style={S.li}>
              Provide false or misleading information during registration, the Interview, or
              listing creation.
            </li>
            <li style={S.li}>
              Attempt to manipulate, disrupt, or circumvent the AI systems, matching algorithm,
              or usage limits of the Platform.
            </li>
            <li style={S.li}>
              Use the Platform for any unlawful purpose or to harass another user.
            </li>
          </ul>
        </div>

        {/* 7 */}
        <div style={S.section}>
          <h2 style={S.h2}>7. Third-Party Services</h2>
          <p style={S.p}>
            The Platform relies on third-party service providers to deliver certain features,
            including conversational AI, voice synthesis, avatar video rendering, and
            language-model-based analysis. Your use of Interview features involves processing of
            your data by these providers as described in our{" "}
            <Link href="/privacy" style={{ color: "#1F4B4A", fontWeight: 600, textDecoration: "none" }}>
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        {/* 8 */}
        <div style={S.section}>
          <h2 style={S.h2}>8. Disclaimers and Limitation of Liability</h2>
          <p style={S.p}>
            The Platform is provided "as is" and "as available," without warranties of any kind,
            express or implied. To the maximum extent permitted by law, Haveniq disclaims all
            warranties, and shall not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the Platform, including reliance on
            matching results or Deal Room content.
          </p>
        </div>

        {/* 9 */}
        <div style={S.section}>
          <h2 style={S.h2}>9. Changes to These Terms</h2>
          <p style={S.p}>
            We may update these Terms from time to time. Continued use of the Platform after
            changes take effect constitutes acceptance of the revised Terms.
          </p>
        </div>

        {/* 10 */}
        <div style={S.section}>
          <h2 style={S.h2}>10. Governing Law</h2>
          <p style={S.p}>
            These Terms are governed by the laws of the State of Israel, without regard to
            conflict-of-law principles.
          </p>
        </div>

        {/* 11 */}
        <div style={S.section}>
          <h2 style={S.h2}>11. Contact</h2>
          <p style={S.p}>
            Questions about these Terms can be directed to our support address listed in the app.
          </p>
        </div>

      </div>
    </div>
  );
}
