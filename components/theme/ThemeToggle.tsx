"use client";
import { useTheme } from "./ThemeProvider";
import { useI18n } from "@/components/LocaleProvider";

/** Sun/moon button that switches between the dark (cinematic) and light themes. */
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { locale } = useI18n();
  const toLight = theme === "dark";
  const label = locale === "he"
    ? (toLight ? "מעבר למצב בהיר" : "מעבר למצב כהה")
    : (toLight ? "Switch to light mode" : "Switch to dark mode");
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      style={{
        width: "2rem", height: "2rem", borderRadius: 999, flexShrink: 0,
        border: "1px solid var(--qp-border)", background: "var(--qp-surface)", color: "var(--qp-ink)",
        display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
      }}
    >
      {toLight ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
