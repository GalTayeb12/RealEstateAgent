"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { TextField, Button } from "@/components/quiet";
import { AuthAside, AuthRoom, translateAuthError } from "@/components/auth/Room";

export default function DevRegisterPage() {
  const router = useRouter();
  const { m } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [registeredUserId, setRegisteredUserId] = useState("");

  const [form, setForm] = useState({
    companyName: "", crn: "", contactName: "", phone: "", email: "", password: "",
  });
  const [questionnaire, setQuestionnaire] = useState({
    yearsExperience: "", completedProjects: "", companyDescription: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function setField(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));
  }
  function setQ(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setQuestionnaire(q => ({ ...q, [field]: e.target.value }));
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    const { companyName, crn, contactName, phone, email, password } = form;
    if (!companyName || !crn || !contactName || !phone || !email || !password) {
      setError(m.dev.allRequired); return;
    }
    setError(""); setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    const { yearsExperience, completedProjects, companyDescription } = questionnaire;
    if (!yearsExperience || !completedProjects || !companyDescription.trim()) {
      setError(m.dev.questionnaireRequired); return;
    }
    setError(""); setLoading(true);
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
      setError(err instanceof Error ? err.message : m.auth.generic);
    } finally {
      setLoading(false);
    }
  }

  const stepTitles = ["", m.dev.step1Title, m.dev.step2Title, m.dev.step3Title];
  const stepBodies = ["", m.dev.step1Body, m.dev.step2Body, m.dev.step3Body];

  return (
    <AuthRoom aside={<AuthAside href="/login" prompt={m.dev.alreadyAccount} action={m.auth.signIn} />}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--qp-muted)", letterSpacing: "0.06em" }}>
          {m.dev.portalLabel}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              width: n === step ? 20 : 7, height: 7, borderRadius: 999,
              background: n < step ? "var(--qp-ink)" : n === step ? "var(--qp-accent)" : "var(--qp-border)",
              transition: "all 0.2s",
            }} />
          ))}
        </div>
      </div>

      <div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 500, margin: "0 0 4px" }}>{stepTitles[step]}</h1>
        <p className="qp-body" style={{ fontSize: 14, margin: 0 }}>{stepBodies[step]}</p>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <form onSubmit={handleStep1} style={{ display: "grid", gap: "0.875rem" }}>
          <TextField label={m.dev.companyNameLabel} type="text" required placeholder={m.dev.companyNamePh}
            value={form.companyName} onChange={setField("companyName")} />
          <TextField label={m.dev.crnLabel} type="text" required placeholder={m.dev.crnPh}
            value={form.crn} onChange={setField("crn")} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
            <TextField label={m.dev.contactNameLabel} type="text" required placeholder={m.dev.contactNamePh}
              value={form.contactName} onChange={setField("contactName")} />
            <TextField label={m.dev.phoneLabel} type="tel" required placeholder={m.dev.phonePh}
              value={form.phone} onChange={setField("phone")} />
          </div>
          <TextField label={m.auth.email} type="email" required autoComplete="email"
            value={form.email} onChange={setField("email")} />
          <TextField label={m.auth.password} type="password" required autoComplete="new-password" placeholder={m.auth.passwordPh}
            value={form.password} onChange={setField("password")} />
          {error && <div className="qp-notice qp-notice--danger" role="alert">{error}</div>}
          <Button type="submit" className="qp-btn--block">{m.dev.continueBtn}</Button>
        </form>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <form onSubmit={handleStep2} style={{ display: "grid", gap: "0.875rem" }}>
          <div style={{ background: "var(--qp-soft)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--qp-muted)", lineHeight: 1.5 }}>
            {m.dev.scoreNote}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
            <TextField label={m.dev.yearsExpLabel} type="number" required min="0" max="99"
              placeholder={m.dev.yearsExpPh} value={questionnaire.yearsExperience} onChange={setQ("yearsExperience")} />
            <TextField label={m.dev.completedProjectsLabel} type="number" required min="0"
              placeholder={m.dev.completedProjectsPh} value={questionnaire.completedProjects} onChange={setQ("completedProjects")} />
          </div>
          <div className="qp-field">
            <label>{m.dev.companyDescLabel}</label>
            <textarea
              required rows={3}
              placeholder={m.dev.companyDescPh}
              value={questionnaire.companyDescription}
              onChange={setQ("companyDescription")}
              style={{ width: "100%", boxSizing: "border-box", minHeight: 80, padding: "0 14px", paddingBlock: 10, borderRadius: 8, border: "1px solid var(--qp-input)", background: "var(--qp-surface)", color: "var(--qp-ink)", font: "inherit", resize: "vertical" }}
            />
          </div>
          {error && <div className="qp-notice qp-notice--danger" role="alert">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={() => { setStep(1); setError(""); }}>{m.dev.continueBtn.includes("המשך") ? "← חזרה" : "← Back"}</Button>
            <Button type="submit" className="qp-btn--block" disabled={loading}>
              {loading ? m.dev.submittingBtn : m.dev.submitBtn}
            </Button>
          </div>
        </form>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <div style={{ display: "grid", gap: "0.875rem" }}>
          <div style={{ background: "var(--qp-soft)", borderRadius: 10, padding: "14px 16px", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#4285F4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--qp-ink)" }}>{m.dev.calendarTitle}</div>
                <div style={{ fontSize: 13, color: "var(--qp-muted)" }}>{m.dev.calendarBody}</div>
              </div>
            </div>
            <ul style={{ margin: 0, paddingInlineStart: "1.25rem", display: "grid", gap: 2 }}>
              {[m.dev.calendarBullet1, m.dev.calendarBullet2, m.dev.calendarBullet3].map(b => (
                <li key={b} style={{ fontSize: 13, color: "var(--qp-muted)" }}>{b}</li>
              ))}
            </ul>
          </div>
          <a
            href={registeredUserId ? `/api/auth/google?userId=${registeredUserId}` : "#"}
            className="qp-btn qp-btn--primary qp-btn--block"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#4285F4", borderColor: "#4285F4", textDecoration: "none" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {m.dev.connectCalendar}
          </a>
          <Button variant="secondary" className="qp-btn--block" onClick={() => router.push("/dev/pending")}>
            {m.dev.skipCalendar}
          </Button>
        </div>
      )}
    </AuthRoom>
  );
}
