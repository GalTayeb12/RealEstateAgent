"use client";
/**
 * /profile — account profile page for all authenticated roles.
 *
 * Shows email (read-only) and role badge, with editable name and phone.
 * Saves via PATCH /api/profile and updates localStorage so TopNav initials
 * reflect the new name immediately on the next navigation.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Profile {
  email: string;
  role: string;
  name: string | null;
  phone: string | null;
}

const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  buyer:     { label: "Buyer",     bg: "#E8F0EF", color: "#1F4B4A" },
  developer: { label: "Developer", bg: "#FBF4E4", color: "#C89B3C" },
  admin:     { label: "Admin",     bg: "#FAE8E8", color: "#B04040" },
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.875rem",
  borderRadius: "0.5rem",
  border: "1px solid #DDD9D3",
  fontSize: "1rem",
  fontFamily: "var(--font-inter, sans-serif)",
  color: "#1C1B19",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const readonlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#F7F5F1",
  color: "#6B6860",
  cursor: "default",
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Profile = await res.json();
      setProfile(data);
      setName(data.name ?? "");
      setPhone(data.phone ?? "");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4000);
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
        const d = await res.json();
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const updated: Profile = await res.json();
      setProfile(updated);
      setName(updated.name ?? "");
      setPhone(updated.phone ?? "");

      // Update localStorage so TopNav initials reflect the new name.
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

  const badge = profile ? (ROLE_BADGE[profile.role] ?? { label: profile.role, bg: "#F0EDE8", color: "#6B6860" }) : null;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#F7F5F1",
      fontFamily: "var(--font-inter, sans-serif)",
      paddingBottom: "4rem",
    }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
          background: "#1C1B19", color: "#FAF8F4", borderRadius: "0.625rem",
          padding: "0.75rem 1.25rem", fontSize: "0.9rem", fontWeight: 500,
          boxShadow: "0 4px 24px rgba(0,0,0,0.22)", zIndex: 9999,
          display: "flex", alignItems: "center", gap: "0.625rem", whiteSpace: "nowrap",
        }}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="#C89B3C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1.5 6 4.5 9 10.5 3"/>
          </svg>
          Profile saved
        </div>
      )}

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #DDD9D3", background: "#fff" }}>
        <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "1.5rem" }}>
          <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.5rem" }}>
            Haveniq
          </div>
          <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0 }}>
            Your profile
          </h1>
          <p style={{ margin: "0.375rem 0 0", color: "#6B6860", fontSize: "0.9375rem" }}>
            Manage your account details.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: "42rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "4rem 0" }}>
            <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(28,27,25,0.08)", borderTopColor: "#1F4B4A", animation: "spin 0.9s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && profile && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Account info card (read-only) */}
            <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.375rem", borderBottom: "1px solid #F0EDE8" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A958F" }}>
                  Account
                </div>
              </div>
              <div style={{ padding: "1.25rem 1.375rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.375rem" }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    readOnly
                    style={readonlyInputStyle}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.375rem" }}>
                    Role
                  </label>
                  <div>
                    {badge && (
                      <span style={{
                        fontSize: "0.75rem", fontWeight: 700,
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        padding: "0.3rem 0.875rem", borderRadius: 999,
                        background: badge.bg, color: badge.color,
                        display: "inline-block",
                      }}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Editable details card */}
            <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.375rem", borderBottom: "1px solid #F0EDE8" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A958F" }}>
                  Personal details
                </div>
              </div>
              <div style={{ padding: "1.25rem 1.375rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.375rem" }}>
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your full name"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = "#1F4B4A")}
                    onBlur={e => (e.currentTarget.style.borderColor = "#DDD9D3")}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", marginBottom: "0.375rem" }}>
                    Phone number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+44 7700 900000"
                    style={inputStyle}
                    onFocus={e => (e.currentTarget.style.borderColor = "#1F4B4A")}
                    onBlur={e => (e.currentTarget.style.borderColor = "#DDD9D3")}
                  />
                </div>

                {error && (
                  <div style={{ padding: "0.625rem 0.875rem", background: "#FAE8E8", borderRadius: "0.5rem", fontSize: "0.875rem", color: "#B04040" }}>
                    {error}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.25rem" }}>
                  <button
                    onClick={save}
                    disabled={saving}
                    style={{
                      padding: "0.625rem 1.5rem",
                      borderRadius: 999,
                      border: "none",
                      background: saving ? "#a5c9c7" : "linear-gradient(155deg, #2F6664, #123332)",
                      color: "#fff",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor: saving ? "not-allowed" : "pointer",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !profile && !error && null}
      </div>
    </main>
  );
}
