"use client";
/**
 * AlertCard — buyer opt-in card for property alerts.
 * Rendered on /results below the buyer profile card.
 * Off by default; turned on with a single toggle.
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

interface AlertPreference {
  active: boolean;
  frequency: "immediate" | "daily";
  minScore: number;
  emailAlerts: boolean;
  siteAlerts: boolean;
}

export function AlertCard({ token }: { token: string }) {
  const { m } = useI18n();
  const ma = m.alerts;

  const [pref, setPref] = useState<AlertPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch("/api/alerts", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.preference) {
          setPref(d.preference);
          setExpanded(d.preference.active);
        } else {
          // No preference yet — default off
          setPref({ active: false, frequency: "immediate", minScore: 0, emailAlerts: true, siteAlerts: true });
        }
      })
      .catch(() => {
        setPref({ active: false, frequency: "immediate", minScore: 0, emailAlerts: true, siteAlerts: true });
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function save(next: AlertPreference) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const d = await res.json();
        setPref(d.preference ?? next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function toggle() {
    if (!pref) return;
    const next = { ...pref, active: !pref.active };
    setExpanded(next.active);
    setPref(next);
    await save(next);
  }

  function update<K extends keyof AlertPreference>(key: K, value: AlertPreference[K]) {
    if (!pref) return;
    const next = { ...pref, [key]: value };
    setPref(next);
    void save(next);
  }

  if (loading || !pref) return null;

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 1px 3px rgba(18,63,64,0.04)", overflow: "hidden" }}>
      <div style={{ height: 4, background: "linear-gradient(90deg, #123F40, #1E6B6C)" }} />
      <div style={{ padding: "1.25rem 1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#123F40", marginBottom: "0.2rem" }}>
              {ma.kicker}
            </div>
            <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1rem", fontWeight: 500, color: "#123F40" }}>
              {ma.title}
            </div>
            {!pref.active && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#526563" }}>{ma.subtitle}</p>
            )}
          </div>
          {/* Toggle */}
          <button
            onClick={toggle}
            disabled={saving}
            aria-pressed={pref.active}
            style={{
              width: "2.75rem",
              height: "1.5rem",
              borderRadius: 999,
              border: "none",
              background: pref.active ? "#123F40" : "#D4DED8",
              cursor: saving ? "not-allowed" : "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute",
              top: "0.1875rem",
              insetInlineStart: pref.active ? "calc(100% - 1.1875rem)" : "0.1875rem",
              width: "1.125rem",
              height: "1.125rem",
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              transition: "inset-inline-start 0.2s",
            }} />
          </button>
        </div>

        {/* Expanded settings */}
        {expanded && pref.active && (
          <div style={{ marginTop: "1.125rem", paddingTop: "1.125rem", borderTop: "1px solid rgba(18,63,64,0.06)", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {/* Frequency */}
            <div>
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#526563", marginBottom: "0.5rem" }}>
                {ma.frequency}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(["immediate", "daily"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => update("frequency", f)}
                    style={{
                      padding: "0.3125rem 0.875rem",
                      borderRadius: 999,
                      border: "1px solid",
                      borderColor: pref.frequency === f ? "#123F40" : "#E0DDD7",
                      background: pref.frequency === f ? "#123F40" : "transparent",
                      color: pref.frequency === f ? "#fff" : "#526563",
                      fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f === "immediate" ? ma.frequencyImmediate : ma.frequencyDaily}
                  </button>
                ))}
              </div>
            </div>

            {/* Min score */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
                <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#526563" }}>
                  {ma.minScore}
                </label>
                <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.9375rem", fontWeight: 600, color: "#123F40" }}>
                  {pref.minScore}
                </span>
              </div>
              <input
                type="range"
                min={0} max={100} step={5}
                value={pref.minScore}
                onChange={e => update("minScore", Number(e.target.value))}
                style={{ width: "100%", accentColor: "#123F40", cursor: "pointer" }}
              />
            </div>

            {/* Channels */}
            <div style={{ display: "flex", gap: "1.5rem" }}>
              {[
                { key: "emailAlerts" as const, label: ma.emailAlerts },
                { key: "siteAlerts"  as const, label: ma.siteAlerts  },
              ].map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem", color: "#526563" }}>
                  <input
                    type="checkbox"
                    checked={pref[key] as boolean}
                    onChange={e => update(key, e.target.checked)}
                    style={{ accentColor: "#123F40", width: "1rem", height: "1rem", cursor: "pointer" }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {saved && (
              <div style={{ fontSize: "0.8125rem", color: "#246046", fontWeight: 500 }}>✓ {ma.saved}</div>
            )}
          </div>
        )}

        {saving && !saved && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#526563" }}>{ma.saving}</div>
        )}
      </div>
    </div>
  );
}
