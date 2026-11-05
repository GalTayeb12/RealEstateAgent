"use client";
/**
 * /profile — My Account page.
 *
 * Sections:
 *   1. Personal details (name, phone, email, role)
 *   2. Buyer interview summary + redo (buyer only)
 *   3. Property alert settings (buyer only, via AlertCard)
 *   4. Language
 *   5. Privacy (download data, delete account)
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { useAudioUnlock } from "@/components/AudioUnlockProvider";
import { AlertCard } from "@/components/AlertCard";
import { MortgageCalculator, MortgageSavedData } from "@/components/MortgageCalculator";
import LanguageToggle from "@/components/LanguageToggle";

interface Profile {
  email: string;
  role: string;
  name: string | null;
  phone: string | null;
}

interface BuyerPrefs {
  location?: unknown;
  bedrooms?: unknown;
  must_haves?: unknown;
  budget?: unknown;
  max_budget?: unknown;
  budget_max?: unknown;
}

interface RateLimit {
  attempts: number;
  remaining: number;
  nextAvailableAt: string | null;
}

const glass: React.CSSProperties = {
  background: "var(--qp-surface)",
  border: "1px solid var(--qp-border)",
  borderRadius: 16,
};

function textOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#526563", marginBottom: "0.75rem" }}>
      {label}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { m } = useI18n();
  const { unlock } = useAudioUnlock();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [prefs, setPrefs] = useState<BuyerPrefs | null>(null);
  const [rate, setRate] = useState<RateLimit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(false);
  const [mortgageSavedData, setMortgageSavedData] = useState<MortgageSavedData | null>(null);

  // Download data
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    const t = localStorage.getItem("token") ?? "";
    if (!t) { router.push("/login"); return; }
    setToken(t);
    try {
      const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${t}` } });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Profile = await res.json();
      setProfile(data);
      setName(data.name ?? "");
      setPhone(data.phone ?? "");

      if (data.role === "buyer") {
        const [buyerRes, limitRes, mortgageRes] = await Promise.all([
          fetch("/api/buyer/profile", { headers: { Authorization: `Bearer ${t}` } }),
          fetch("/api/interview/rate-limit", { headers: { Authorization: `Bearer ${t}` } }),
          fetch("/api/buyer/mortgage-settings", { headers: { Authorization: `Bearer ${t}` } }),
        ]);
        if (buyerRes.ok) {
          const buyer = await buyerRes.json();
          setPrefs(buyer.buyer_preferences ?? {});
        }
        if (limitRes.ok) setRate(await limitRes.json());
        if (mortgageRes.ok) {
          const md: MortgageSavedData | null = await mortgageRes.json();
          if (md) setMortgageSavedData(md);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError("");
    const t = localStorage.getItem("token") ?? "";
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const updated: Profile = await res.json();
      setProfile(updated);
      setName(updated.name ?? "");
      setPhone(updated.phone ?? "");
      try {
        const raw = localStorage.getItem("user");
        if (raw) {
          const stored = JSON.parse(raw);
          localStorage.setItem("user", JSON.stringify({ ...stored, name: updated.name }));
        }
      } catch { /* ignore */ }
      setToast(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadData() {
    setDownloading(true);
    try {
      const t = localStorage.getItem("token") ?? "";
      const res = await fetch("/api/profile/download", { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? "haveniq-data.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setDownloading(false);
  }

  async function saveMortgage(data: { equity: number; desiredPayment: number | null; buyerType: string; income: number | null; maxPrice: number | null }) {
    const t = localStorage.getItem("token") ?? "";
    try {
      const res = await fetch("/api/buyer/mortgage-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated: MortgageSavedData = await res.json();
        setMortgageSavedData(updated);
      }
    } catch { /* ignore */ }
  }

  const roleLabel: Record<string, string> = {
    buyer: m.nav.roleBuyer,
    developer: m.nav.roleDeveloper,
    seller: m.nav.roleSeller,
    admin: m.nav.roleAdmin,
  };

  const budget = textOf(prefs?.budget) || textOf(prefs?.max_budget) || textOf(prefs?.budget_max);
  const area = textOf(prefs?.location);
  const rooms = textOf(prefs?.bedrooms);
  const matters = Array.isArray(prefs?.must_haves)
    ? (prefs.must_haves as unknown[]).map(textOf).filter(Boolean)
    : [];
  const canRedo = !!rate && rate.remaining > 0;

  const field: React.CSSProperties = {
    width: "100%",
    padding: "0.7rem 0.9rem",
    borderRadius: 8,
    border: "1px solid var(--qp-input)",
    background: "var(--qp-surface)",
    color: "var(--qp-ink)",
    fontSize: "1rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--qp-bg)",
      color: "var(--qp-ink)",
      fontFamily: "var(--font-heebo, sans-serif)",
      padding: "2.5rem 1.25rem 5rem",
    }}>
      {toast && (
        <div style={{
          position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
          background: "var(--qp-surface)", color: "var(--qp-ink)", border: "1px solid var(--qp-border)",
          borderRadius: 999, padding: "0.7rem 1.15rem", zIndex: 50, fontWeight: 600,
        }}>
          {m.profile.saved}
        </div>
      )}


      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
        <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)", fontWeight: 500, marginBottom: "0.4rem" }}>
          {m.profile.kicker}
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "2.1rem", fontWeight: 600, margin: "0 0 0.4rem" }}>
          {m.profile.title}
        </h1>
        <p style={{ margin: "0 0 2rem", color: "var(--qp-muted)", lineHeight: 1.7 }}>{m.profile.subtitle}</p>

        {loading && <div style={{ color: "var(--qp-muted)" }}>{m.common.loading}</div>}
        {error && <div role="alert" style={{ color: "var(--qp-error)", background: "var(--qp-error-bg)", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>{error}</div>}

        {!loading && profile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* ── Personal details ── */}
            <section>
              <SectionLabel label={m.profile.sectionPersonal} />
              <div style={{ ...glass, padding: "1.25rem 1.35rem" }}>
                <label style={{ display: "block", fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.35rem" }}>{m.profile.email}</label>
                <input value={profile.email} readOnly style={{ ...field, background: "var(--qp-soft)", color: "var(--qp-muted)" }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.9rem" }} className="hn-profile-grid">
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.35rem" }}>{m.profile.name}</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.35rem" }}>{m.profile.phone}</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} style={field} />
                  </div>
                </div>

                <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.35rem" }}>{m.profile.role}</div>
                    <span style={{
                      display: "inline-flex",
                      padding: "0.2rem 0.7rem",
                      borderRadius: 999,
                      background: "var(--qp-warning-bg)",
                      color: "var(--qp-warning)",
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                    }}>
                      {roleLabel[profile.role] ?? profile.role}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void save(); }}
                    disabled={saving}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "0.6rem 1.1rem",
                      background: saving ? "var(--qp-disabled-bg)" : "var(--qp-ink)",
                      color: saving ? "var(--qp-disabled-text)" : "var(--qp-on-primary)",
                      minHeight: 48,
                      fontWeight: 600,
                      cursor: saving ? "wait" : "pointer",
                    }}
                  >
                    {saving ? m.profile.saving : m.profile.save}
                  </button>
                </div>
              </div>
            </section>

            {/* ── Mortgage calculator ── */}
            {profile.role === "buyer" && (
              <section id="mortgage">
                <SectionLabel label={m.profile.sectionMortgage} />
                <MortgageCalculator
                  savedData={mortgageSavedData}
                  onSave={saveMortgage}
                />
              </section>
            )}

            {/* ── Buyer interview summary ── */}
            {profile.role === "buyer" && (
              <section>
                <SectionLabel label={m.profile.interviewTitle} />
                <div style={{ ...glass, padding: "1.25rem 1.35rem" }}>
                  {!prefs ? (
                    <p style={{ margin: 0, color: "var(--qp-muted)", lineHeight: 1.7 }}>{m.profile.interviewEmpty}</p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem 1.25rem" }}>
                      {([
                        [m.profile.budget, budget],
                        [m.profile.area, area],
                        [m.profile.rooms, rooms],
                      ] as const).map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.2rem" }}>{label}</div>
                          <div style={{ fontWeight: 500 }}>{value || m.profile.none}</div>
                        </div>
                      ))}
                      <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)", marginBottom: "0.4rem" }}>{m.profile.matters}</div>
                        {matters.length === 0 ? (
                          <div>{m.profile.none}</div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                            {matters.map((item) => (
                              <span key={item} style={{
                                padding: "0.25rem 0.65rem",
                                borderRadius: 999,
                                background: "var(--qp-soft)",
                                border: "1px solid var(--qp-border)",
                                color: "var(--qp-ink)",
                                fontSize: "0.875rem",
                              }}>{item}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: "1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)" }}>
                      {rate
                        ? (rate.remaining === 0
                          ? m.profile.quotaBlocked
                          : `${rate.attempts}/2 ${m.profile.quotaUsed}`)
                        : m.common.loading}
                    </div>
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={() => {
                        sessionStorage.setItem("requestedRetake", "true");
                        void unlock();
                        router.push("/interview");
                      }}
                      style={{
                        borderRadius: 999,
                        border: "1px solid transparent",
                        background: canRedo ? "var(--qp-ink)" : "var(--qp-disabled-bg)",
                        color: canRedo ? "var(--qp-on-primary)" : "var(--qp-disabled-text)",
                        minHeight: 48,
                        padding: "0.55rem 1rem",
                        fontWeight: 600,
                        cursor: canRedo ? "pointer" : "not-allowed",
                      }}
                    >
                      {m.profile.redo}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* ── Alert settings (buyer only) ── */}
            {profile.role === "buyer" && token && (
              <section>
                <SectionLabel label={m.profile.sectionAlerts} />
                <AlertCard token={token} />
              </section>
            )}

            {/* ── Language ── */}
            <section>
              <SectionLabel label={m.profile.sectionLang} />
              <div style={{ ...glass, padding: "1.25rem 1.35rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.9375rem", color: "var(--qp-ink)", marginBottom: "0.2rem" }}>{m.profile.langTitle}</div>
                  <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)" }}>{m.profile.langBody}</div>
                </div>
                <LanguageToggle />
              </div>
            </section>

            {/* ── Privacy ── */}
            <section>
              <SectionLabel label={m.profile.sectionPrivacy} />
              <div style={{ ...glass, padding: "1.25rem 1.35rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.9375rem", color: "var(--qp-ink)", marginBottom: "0.2rem" }}>{m.profile.privacyTitle}</div>
                  <div style={{ fontSize: "0.875rem", color: "var(--qp-muted)" }}>{m.profile.privacyBody}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  <button
                    type="button"
                    onClick={() => { void downloadData(); }}
                    disabled={downloading}
                    style={{
                      alignSelf: "flex-start",
                      padding: "0.5rem 1.125rem",
                      borderRadius: 999,
                      border: "1px solid var(--qp-border)",
                      background: "none",
                      color: "var(--qp-ink)",
                      fontWeight: 600,
                      cursor: downloading ? "wait" : "pointer",
                      fontSize: "0.875rem",
                      display: "flex", alignItems: "center", gap: "0.4rem",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    {downloading ? m.profile.downloading : m.profile.downloadData}
                  </button>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--qp-muted)", lineHeight: 1.6 }}>
                    {m.profile.deleteContact}
                    <a href={`mailto:${m.profile.deleteEmail}`} style={{ color: "var(--qp-ink)", fontWeight: 500 }}>{m.profile.deleteEmail}</a>
                  </p>
                </div>
              </div>
            </section>

          </div>
        )}
      </div>
      <style>{`
        @media (max-width: 640px) {
          .hn-profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
