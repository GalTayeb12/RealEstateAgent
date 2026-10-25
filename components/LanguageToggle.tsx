"use client";

import { useI18n } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n/locale";

export default function LanguageToggle() {
  const { locale, setLocale, m } = useI18n();

  return (
    <div
      role="group"
      aria-label={m.lang.label}
      style={{
        display: "inline-flex",
        border: "1px solid #DDD9D3",
        borderRadius: 999,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {(["he", "en"] as const).map((code) => {
        const active = locale === code;
        const label: Record<Locale, string> = { he: "עב", en: "EN" };
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => void setLocale(code)}
            style={{
              border: "none",
              background: active ? "#1F4B4A" : "transparent",
              color: active ? "#fff" : "#55534C",
              fontWeight: 700,
              fontSize: "0.75rem",
              padding: "0.4rem 0.75rem",
              cursor: "pointer",
              fontFamily: "var(--font-inter, sans-serif)",
            }}
          >
            {label[code]}
          </button>
        );
      })}
    </div>
  );
}
