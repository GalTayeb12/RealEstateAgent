"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useI18n } from "@/components/LocaleProvider";

export function Ambient() {
  return (
    <div className="hq-ambient" aria-hidden>
      <div className="hq-ambient__grid" />
    </div>
  );
}

export function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hq-glass ${className}`}>{children}</div>;
}

export function Card({ kicker, title, children }: { kicker?: string; title?: string; children: ReactNode }) {
  return (
    <section className="hq-card">
      {kicker && <div className="hq-kicker">{kicker}</div>}
      {title && <h3 style={{ fontSize: "1.15rem", marginBottom: "0.45rem" }}>{title}</h3>}
      <div style={{ color: "var(--hq-muted)", lineHeight: 1.55 }}>{children}</div>
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type="button" className={`hq-btn hq-btn--${variant} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="hq-brand" aria-label="Haveniq">
      <img src="/haveniq_app_icon.png" alt="" width={32} height={32} />
      Haveniq
    </Link>
  );
}

export function HqLang() {
  const { locale, setLocale, m } = useI18n();
  return (
    <div className="hq-lang" role="group" aria-label={m.lang.label}>
      {(["he", "en"] as const).map((code) => (
        <button key={code} type="button" aria-pressed={locale === code} onClick={() => void setLocale(code)}>
          {code === "he" ? "עב" : "EN"}
        </button>
      ))}
    </div>
  );
}

const PILL = {
  available: "hq-pill hq-pill--available",
  reserved: "hq-pill hq-pill--reserved",
  sold: "hq-pill hq-pill--sold",
  pending: "hq-pill hq-pill--pending",
  danger: "hq-pill hq-pill--danger",
} as const;

export function StatusPill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={PILL[tone]}>{children}</span>;
}

export function Input({
  label,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="hq-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} {...rest} />
      {error && <span className="hq-field__error">{error}</span>}
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="hq-steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((label, index) => (
        <li key={label} className={index <= current ? "hq-step hq-step--on" : "hq-step"} aria-current={index === current ? "step" : undefined}>
          <small>0{index + 1}</small>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function Skeleton({ width = "100%" }: { width?: string }) {
  return <div className="hq-skel" style={{ width }} aria-hidden />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="hq-card" style={{ textAlign: "center" }}>
      <h3 style={{ fontSize: "1.25rem" }}>{title}</h3>
      <p style={{ color: "var(--hq-muted)", lineHeight: 1.6 }}>{body}</p>
      {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
    </div>
  );
}

export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="hq-num">{shown}</span>;
}

export function Toast({ message }: { message: string }) {
  return (
    <div className="hq-toast" role="status">
      {message}
    </div>
  );
}

export function Overlay({
  mode,
  title,
  children,
  onClose,
  closeLabel,
}: {
  mode: "modal" | "sheet";
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={mode === "sheet" ? "hq-overlay hq-overlay--sheet" : "hq-overlay"} onClick={onClose}>
      <div
        className="hq-glass hq-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{title}</h3>
        <div style={{ color: "var(--hq-muted)", lineHeight: 1.6 }}>{children}</div>
        <div style={{ marginTop: "1rem" }}>
          <Button variant="secondary" onClick={onClose}>{closeLabel}</Button>
        </div>
      </div>
    </div>
  );
}
