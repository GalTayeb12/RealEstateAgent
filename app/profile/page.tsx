"use client";
/**
 * /profile — personal details for every role, plus the buyer's interview summary.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

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
  background: "#FFFFFF",
  border: "1px solid #D4DED8",
  borderRadius: 16,
};

function textOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

export default function ProfilePage() {
  const router = useRouter();
  const { m } = useI18n();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [prefs, setPrefs] = useState<BuyerPrefs | null>(null);
  const [rate, setRate] = useState<RateLimit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Profile = await res.json();
      setProfile(data);
      setName(data.name ?? "");
      setPhone(data.phone ?? "");

      if (data.role === "buyer") {
        const [buyerRes, limitRes] = await Promise.all([
          fetch("/api/buyer/profile", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/interview/rate-limit", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (buyerRes.ok) {
          const buyer = await buyerRes.json();
          setPrefs(buyer.buyer_preferences ?? {});
        } else {
          setPrefs(null);
        }
        if (limitRes.ok) setRate(await limitRes.json());
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
    const token = localStorage.getItem("token") ?? "";
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
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
    ? prefs.must_haves.map(textOf).filter(Boolean)
    : [];
  const canRedo = !!rate && rate.remaining > 0;

  const field: React.CSSProperties = {
    width: "100%",
    padding: "0.7rem 0.9rem",
    borderRadius: 8,
    border: "1px solid #718580",
    background: "#FFFFFF",
    color: "#123F40",
    fontSize: "1rem",
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#F4F5F0",
      color: "#123F40",
      fontFamily: "var(--font-heebo, var(--font-inter, sans-serif))",
      padding: "2.5rem 1.25rem 5rem",
    }}>
      {toast && (
        <div style={{
          position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
          background: "#FFFFFF", color: "#123F40", border: "1px solid #D4DED8",
          borderRadius: 999, padding: "0.7rem 1.15rem", zIndex: 50, fontWeight: 600,
        }}>
          {m.profile.saved}
        </div>
      )}

      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
        <div style={{ fontSize: "0.875rem", color: "#526563", fontWeight: 500, marginBottom: "0.4rem" }}>
          {m.profile.kicker}
        </div>
        <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "2.1rem", fontWeight: 600, margin: "0 0 0.4rem" }}>
          {m.profile.title}
        </h1>
        <p style={{ margin: "0 0 1.5rem", color: "#526563", lineHeight: 1.7 }}>{m.profile.subtitle}</p>

        {loading && <div style={{ color: "#526563" }}>{m.common.loading}</div>}
        {error && <div role="alert" style={{ color: "#9E3434", background: "#FBECEA", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem" }}>{error}</div>}

        {!loading && profile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <section style={{ ...glass, padding: "1.25rem 1.35rem" }}>
              <label style={{ display: "block", fontSize: "0.875rem", color: "#526563", marginBottom: "0.35rem" }}>{m.profile.email}</label>
              <input value={profile.email} readOnly style={{ ...field, background: "#E9EEEA", color: "#526563" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginTop: "0.9rem" }} className="hn-profile-grid">
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#526563", marginBottom: "0.35rem" }}>{m.profile.name}</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={field} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#526563", marginBottom: "0.35rem" }}>{m.profile.phone}</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={field} />
                </div>
              </div>

              <div style={{ marginTop: "0.9rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.875rem", color: "#526563", marginBottom: "0.35rem" }}>{m.profile.role}</div>
                  <span style={{
                    display: "inline-flex",
                    padding: "0.2rem 0.7rem",
                    borderRadius: 999,
                    background: "#FCF2D9",
                    color: "#785716",
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
                    background: saving ? "#E0E5E1" : "#123F40",
                    color: saving ? "#596963" : "#fff",
                    minHeight: 48,
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? m.profile.saving : m.profile.save}
                </button>
              </div>
            </section>

            {profile.role === "buyer" && (
              <section style={{ ...glass, padding: "1.25rem 1.35rem" }}>
                <div style={{ fontSize: "1rem", color: "#123F40", fontWeight: 500, marginBottom: "0.9rem" }}>
                  {m.profile.interviewTitle}
                </div>
                {!prefs ? (
                  <p style={{ margin: 0, color: "#526563", lineHeight: 1.7 }}>{m.profile.interviewEmpty}</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem 1.25rem" }}>
                    {([
                      [m.profile.budget, budget],
                      [m.profile.area, area],
                      [m.profile.rooms, rooms],
                    ] as const).map(([label, value]) => (
                      <div key={label}>
                        <div style={{ fontSize: "0.875rem", color: "#526563", marginBottom: "0.2rem" }}>{label}</div>
                        <div style={{ fontWeight: 500 }}>{value || m.profile.none}</div>
                      </div>
                    ))}
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "0.875rem", color: "#526563", marginBottom: "0.4rem" }}>{m.profile.matters}</div>
                      {matters.length === 0 ? (
                        <div>{m.profile.none}</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {matters.map((item) => (
                            <span key={item} style={{
                              padding: "0.25rem 0.65rem",
                              borderRadius: 999,
                              background: "#E9EEEA",
                              border: "1px solid #D4DED8",
                              color: "#123F40",
                              fontSize: "0.875rem",
                            }}>{item}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "1.1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "0.875rem", color: "#526563" }}>
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
                      router.push("/interview");
                    }}
                    style={{
                      borderRadius: 999,
                      border: "1px solid transparent",
                      background: canRedo ? "#123F40" : "#E0E5E1",
                      color: canRedo ? "#FFFFFF" : "#596963",
                      minHeight: 48,
                      padding: "0.55rem 1rem",
                      fontWeight: 600,
                      cursor: canRedo ? "pointer" : "not-allowed",
                    }}
                  >
                    {m.profile.redo}
                  </button>
                </div>
              </section>
            )}
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
