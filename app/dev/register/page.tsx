"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const INPUT_STYLE: React.CSSProperties = {
  background: "#F0EDE8", border: "1px solid #DDD9D3", borderRadius: "0.5rem",
  padding: "0.625rem 0.875rem", fontSize: "0.9375rem", color: "#1C1B19",
  outline: "none", width: "100%", boxSizing: "border-box",
};

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6B6860" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function DevRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [registeredUserId, setRegisteredUserId] = useState("");

  // Step 1 fields
  const [form, setForm] = useState({
    companyName: "", crn: "", contactName: "", phone: "", email: "", password: "",
  });

  // Step 2 questionnaire
  const [questionnaire, setQuestionnaire] = useState({
    yearsExperience: "",
    completedProjects: "",
    companyDescription: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function setQ(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setQuestionnaire((q) => ({ ...q, [field]: e.target.value }));
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { companyName, crn, contactName, phone, email, password } = form;
    if (!companyName || !crn || !contactName || !phone || !email || !password) {
      setError("All fields are required.");
      return;
    }
    setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { yearsExperience, completedProjects, companyDescription } = questionnaire;
    if (!yearsExperience || !completedProjects || !companyDescription.trim()) {
      setError("All questionnaire fields are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/dev/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          yearsExperience: Number(yearsExperience),
          completedProjects: Number(completedProjects),
          companyDescription: companyDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      sessionStorage.setItem("dev_pending_email", form.email);
      setRegisteredUserId(data.userId ?? "");
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = "#1F4B4A";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)";
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = "#DDD9D3";
      e.currentTarget.style.boxShadow = "none";
    },
  };

  return (
    <main style={{ minHeight: "100vh", background: "#F7F5F1", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", fontFamily: "var(--font-inter, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ background: "#fff", borderRadius: "1rem", border: "1px solid #DDD9D3", borderTop: "4px solid #1F4B4A", overflow: "hidden" }}>
          <div style={{ padding: "2.5rem", display: "flex", flexDirection: "column", gap: "1.75rem" }}>

            {/* Header */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A" }}>
                  Haveniq — Developer Portal
                </div>
                {/* Step indicator */}
                <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                  {[1, 2, 3].map(n => (
                    <div key={n} style={{
                      width: n === step ? "1.5rem" : "0.5rem", height: "0.5rem", borderRadius: "999px",
                      background: n < step ? "#1F4B4A" : n === step ? "#C89B3C" : "#DDD9D3",
                      transition: "all 0.2s",
                    }} />
                  ))}
                </div>
              </div>
              <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0, lineHeight: 1.15 }}>
                {step === 1 ? "Register your company" : step === 2 ? "Tell us about your work" : "Connect Google Calendar"}
              </h1>
              <p style={{ margin: "0.375rem 0 0", color: "#6B6860", fontSize: "0.9375rem" }}>
                {step === 1
                  ? "Accounts are verified against the companies registry and require solicitor sign-off before activation."
                  : step === 2
                  ? "A short questionnaire to establish your baseline quality score on the platform."
                  : "Optional — connect your Google account to schedule Google Meet calls with buyers when negotiations reach their limit."}
              </p>
            </div>

            {/* STEP 1 — company / account fields */}
            {step === 1 && (
              <form onSubmit={handleStep1} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <FieldWrap label="Company name">
                  <input type="text" required value={form.companyName} onChange={setField("companyName")}
                    placeholder="BuildCo Development Ltd" style={INPUT_STYLE} {...focusHandlers} />
                </FieldWrap>
                <FieldWrap label="Company registration number (CRN)">
                  <input type="text" required value={form.crn} onChange={setField("crn")}
                    placeholder="12345678" style={INPUT_STYLE} {...focusHandlers} />
                </FieldWrap>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <FieldWrap label="Contact name">
                    <input type="text" required value={form.contactName} onChange={setField("contactName")}
                      placeholder="Jane Smith" style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                  <FieldWrap label="Phone">
                    <input type="tel" required value={form.phone} onChange={setField("phone")}
                      placeholder="+44 7700 900000" style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                </div>
                <div style={{ borderTop: "1px solid #F0EDE8", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <FieldWrap label="Email address">
                    <input type="email" required value={form.email} onChange={setField("email")}
                      placeholder="you@yourcompany.com" style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                  <FieldWrap label="Password">
                    <input type="password" required value={form.password} onChange={setField("password")}
                      placeholder="Choose a password" style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                </div>

                {error && <ErrorBox message={error} />}

                <button type="submit" style={btnStyle(false)}>
                  Continue →
                </button>
              </form>
            )}

            {/* STEP 2 — questionnaire */}
            {step === 2 && (
              <form onSubmit={handleStep2} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ background: "#F7F5F1", borderRadius: "0.625rem", padding: "0.875rem 1rem", fontSize: "0.8125rem", color: "#6B6860", lineHeight: 1.5 }}>
                  Your answers are used to generate an initial quality score that developers see on the platform. Be accurate — scores are recalibrated over time based on real behaviour.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <FieldWrap label="Years of experience">
                    <input type="number" required min="0" max="99" value={questionnaire.yearsExperience}
                      onChange={setQ("yearsExperience")} placeholder="e.g. 8"
                      style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                  <FieldWrap label="Completed projects">
                    <input type="number" required min="0" value={questionnaire.completedProjects}
                      onChange={setQ("completedProjects")} placeholder="e.g. 14"
                      style={INPUT_STYLE} {...focusHandlers} />
                  </FieldWrap>
                </div>

                <FieldWrap label="Tell us about your company and how you typically work with buyers">
                  <textarea
                    required
                    rows={5}
                    value={questionnaire.companyDescription}
                    onChange={setQ("companyDescription")}
                    placeholder="Describe your company's approach, what kinds of projects you develop, and how you engage with buyers through the sales process…"
                    style={{
                      ...INPUT_STYLE,
                      resize: "vertical",
                      fontFamily: "var(--font-inter, sans-serif)",
                      lineHeight: 1.55,
                    }}
                    {...focusHandlers}
                  />
                </FieldWrap>

                {error && <ErrorBox message={error} />}

                <div style={{ display: "flex", gap: "0.625rem" }}>
                  <button type="button" onClick={() => { setStep(1); setError(""); }}
                    style={{ ...btnStyle(false), background: "#fff", color: "#1C1B19", border: "1px solid #DDD9D3", flex: "0 0 auto" }}>
                    ← Back
                  </button>
                  <button type="submit" disabled={loading} style={{ ...btnStyle(loading), flex: 1 }}>
                    {loading ? "Scoring & submitting…" : "Submit for verification"}
                  </button>
                </div>

                {loading && (
                  <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "#6B6860", margin: 0 }}>
                    Evaluating your questionnaire with AI — this takes a few seconds…
                  </p>
                )}
              </form>
            )}

            {/* STEP 3 — Google Calendar connect */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {/* Google icon + explanation */}
                <div style={{ background: "#F7F5F1", borderRadius: "0.75rem", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {/* Calendar icon */}
                    <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.5rem", background: "#4285F4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1C1B19" }}>Google Calendar + Meet</div>
                      <div style={{ fontSize: "0.8125rem", color: "#6B6860" }}>When negotiations reach the limit, schedule a live meeting with one click</div>
                    </div>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    <li style={{ fontSize: "0.8125rem", color: "#6B6860" }}>Creates a Google Meet link automatically</li>
                    <li style={{ fontSize: "0.8125rem", color: "#6B6860" }}>Invites both you and the buyer via calendar event</li>
                    <li style={{ fontSize: "0.8125rem", color: "#6B6860" }}>You can connect or reconnect anytime from your dashboard</li>
                  </ul>
                </div>

                <a
                  href={registeredUserId ? `/api/auth/google?userId=${registeredUserId}` : "#"}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.625rem",
                    padding: "0.875rem", borderRadius: "0.5rem", border: "none",
                    background: "#4285F4", color: "#fff",
                    fontSize: "0.9375rem", fontWeight: 600,
                    textDecoration: "none",
                    opacity: registeredUserId ? 1 : 0.5,
                    cursor: registeredUserId ? "pointer" : "not-allowed",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Connect Google Calendar
                </a>

                <button
                  type="button"
                  onClick={() => router.push("/dev/pending")}
                  style={{ padding: "0.875rem", borderRadius: "0.5rem", border: "1px solid #DDD9D3", background: "#fff", color: "#6B6860", fontSize: "0.9375rem", fontWeight: 500, cursor: "pointer" }}
                >
                  Skip for now — I&apos;ll connect later
                </button>
              </div>
            )}

            {step !== 3 && (
              <p style={{ textAlign: "center", fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>
                Already have an account?{" "}
                <Link href="/login" style={{ color: "#1F4B4A", fontWeight: 600 }}>Sign in</Link>
              </p>
            )}
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#6B6860", marginTop: "1.25rem" }}>
          Haveniq — Developer Portal · prototype v0.1
        </p>
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ background: "#FAE8E8", border: "1px solid rgba(176,64,64,0.2)", borderRadius: "0.5rem", padding: "0.75rem 1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
      <span style={{ color: "#B04040", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>Error</span>
      <span style={{ color: "#B04040", fontSize: "0.875rem" }}>{message}</span>
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.875rem", borderRadius: "0.5rem", border: "none",
    background: "#C89B3C", color: "#fff",
    fontSize: "0.9375rem", fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}
