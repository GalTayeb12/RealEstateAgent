"use client";

import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import Image from "next/image";
import { Money } from "@/components/Money";
import "./quiet.css";

type ButtonVariant = "primary" | "secondary" | "ghost";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(
  function Button({ variant = "primary", className = "", children, ...rest }, ref) {
    return (
      <button ref={ref} type="button" className={`qp-btn qp-btn--${variant} ${className}`} {...rest}>
        {children}
      </button>
    );
  },
);

export function TextField({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="qp-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && <p id={hintId} className="qp-hint">{hint}</p>}
      {error && <p id={errorId} className="qp-error" role="alert">{error}</p>}
    </div>
  );
}

const BADGE = {
  neutral: "qp-badge",
  success: "qp-badge qp-badge--success",
  warning: "qp-badge qp-badge--warning",
  error: "qp-badge qp-badge--error",
  info: "qp-badge qp-badge--info",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={BADGE[tone]}>{children}</span>;
}

export function PropertyCard({
  imageSrc,
  imageAlt,
  title,
  price,
  match,
  reasons,
  matchLabel,
  illustrative,
  missingLabel,
}: {
  imageSrc?: string;
  imageAlt: string;
  title: string;
  price: number;
  match: number;
  reasons: string[];
  matchLabel: string;
  illustrative: string;
  missingLabel: string;
}) {
  const [failed, setFailed] = useState(!imageSrc);
  return (
    <article className="qp-card">
      <div className="qp-photo">
        {failed || !imageSrc ? (
          <p className="qp-photo__missing">{missingLabel}</p>
        ) : (
          <Image src={imageSrc} alt={imageAlt} fill sizes="(max-width: 800px) 100vw, 560px" onError={() => setFailed(true)} />
        )}
      </div>
      <div className="qp-card__body">
        <div className="qp-card__top">
          <h3 className="qp-h4">{title}</h3>
          <Badge>{illustrative}</Badge>
        </div>
        <p className="qp-h4 qp-num"><Money amount={price} /></p>
        <p className="qp-small"><span dir="ltr" className="qp-num">{match}%</span> {matchLabel}</p>
        <ul className="qp-reasons">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>
    </article>
  );
}

export function SectionNav({
  brand,
  label,
  links,
  end,
}: {
  brand: string;
  label: string;
  links: Array<{ href: string; label: string }>;
  end?: ReactNode;
}) {
  return (
    <header className="qp-nav">
      <a className="qp-brand" href="#intro">{brand}</a>
      <nav className="qp-nav__links" aria-label={label}>
        {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
      </nav>
      {end && <div className="qp-nav__end">{end}</div>}
    </header>
  );
}

export function UserMenu({
  name,
  email,
  role,
  openLabel,
  items,
}: {
  name: string;
  email: string;
  role: string;
  openLabel: string;
  items: Array<{ id: string; label: string; onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const buttons = [...(wrapRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
      if (buttons.length === 0) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
      buttons[index === -1 ? 0 : next]?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="qp-menu-wrap" ref={wrapRef}>
      <Button ref={buttonRef} variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {openLabel}
      </Button>
      {open && (
        <div className="qp-menu" role="menu" aria-label={openLabel}>
          <header>
            <strong>{name}</strong>
            <p className="qp-small" dir="ltr">{email}</p>
            <p className="qp-small">{role}</p>
          </header>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
                buttonRef.current?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Dialog({
  open,
  title,
  mode,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  mode: "modal" | "sheet";
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      [...(panel?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])];
    (focusable()[0] ?? panel)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={mode === "sheet" ? "qp-overlay qp-overlay--sheet" : "qp-overlay"} onClick={() => onCloseRef.current()}>
      <div
        ref={panelRef}
        className="qp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="qp-h3">{title}</h2>
        <div>{children}</div>
        <Button variant="secondary" onClick={() => onCloseRef.current()}>{closeLabel}</Button>
      </div>
    </div>
  );
}

export function Notice({ message }: { message: string }) {
  return <div className="qp-toast" role="status">{message}</div>;
}

export function Skeleton({ width = "100%" }: { width?: string }) {
  return <div className="qp-skel" style={{ width }} aria-hidden />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="qp-card qp-empty">
      <h3 className="qp-h3">{title}</h3>
      <p className="qp-body">{body}</p>
      {action}
    </div>
  );
}

export function GlassPanel({ children }: { children: ReactNode }) {
  return <div className="qp-glass">{children}</div>;
}

export function QuietPhoto({ src, alt, missingLabel, priority = false, objectPosition = "62% 58%" }: { src: string; alt: string; missingLabel: string; priority?: boolean; objectPosition?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="qp-hero__missing">{missingLabel}</p>;
  return <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 800px) 100vw, 70vw" style={{ objectPosition }} onError={() => setFailed(true)} />;
}

export function QuietScrollScene({
  imageSrc,
  mobileSrc,
  imageAlt,
  missingLabel,
  title,
  titleNext,
  body,
  captionValue,
  captionLabel,
  cta,
  note,
  onCta,
}: {
  imageSrc: string;
  mobileSrc: string;
  imageAlt: string;
  missingLabel: string;
  title: string;
  titleNext: string;
  body: string;
  captionValue?: string;
  captionLabel?: string;
  cta: string;
  note?: string;
  onCta: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const lineARef = useRef<HTMLSpanElement>(null);
  const lineBRef = useRef<HTMLSpanElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const [failedDesktop, setFailedDesktop] = useState(false);
  const [failedMobile, setFailedMobile] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const photo = photoRef.current;
    if (!section || !photo) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = window.matchMedia("(max-width: 800px)");
    let frame = 0;

    const apply = () => {
      const nav = document.querySelector<HTMLElement>(".qp-nav");
      const navH = nav?.getBoundingClientRect().height ?? 0;
      section.style.setProperty("--qp-nav-h", `${navH}px`);
      const still = reduce.matches || narrow.matches;
      if (still) {
        photo.style.removeProperty("--qp-scale");
        photo.style.removeProperty("--qp-x");
        photo.style.removeProperty("--qp-y");
        section.style.removeProperty("--qp-a");
        section.style.removeProperty("--qp-b");
        section.style.removeProperty("--qp-cap");
        lineARef.current?.setAttribute("aria-hidden", "false");
        lineBRef.current?.setAttribute("aria-hidden", "false");
        capRef.current?.setAttribute("aria-hidden", "false");
        return;
      }
      const rect = section.getBoundingClientRect();
      const stickyH = window.innerHeight - navH;
      const travel = Math.max(1, section.offsetHeight - stickyH);
      const progress = Math.min(1, Math.max(0, (navH - rect.top) / travel));
      const scale = 1 + progress * 0.08;
      photo.style.setProperty("--qp-scale", scale.toFixed(4));
      photo.style.setProperty("--qp-x", `${(-8 * progress).toFixed(2)}px`);
      photo.style.setProperty("--qp-y", "0px");
      const fadeA = progress <= 0.28 ? 1 : progress >= 0.42 ? 0 : 1 - (progress - 0.28) / 0.14;
      const fadeB = progress <= 0.36 ? 0 : progress >= 0.5 ? 1 : (progress - 0.36) / 0.14;
      const cap = progress <= 0.62 ? 0 : progress >= 0.78 ? 1 : (progress - 0.62) / 0.16;
      section.style.setProperty("--qp-a", fadeA.toFixed(3));
      section.style.setProperty("--qp-b", fadeB.toFixed(3));
      section.style.setProperty("--qp-cap", cap.toFixed(3));
      const showNext = progress >= 0.4;
      lineARef.current?.setAttribute("aria-hidden", showNext ? "true" : "false");
      lineBRef.current?.setAttribute("aria-hidden", showNext ? "false" : "true");
      capRef.current?.setAttribute("aria-hidden", cap < 0.45 ? "true" : "false");
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    reduce.addEventListener("change", onScroll);
    narrow.addEventListener("change", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      reduce.removeEventListener("change", onScroll);
      narrow.removeEventListener("change", onScroll);
    };
  }, []);

  return (
    <section id="hero" className="qp-scroll" ref={sectionRef}>
      <div className="qp-scroll__sticky">
        <div className="qp-scroll__clip">
          <div className="qp-scroll__photo" ref={photoRef}>
            {failedDesktop ? (
              <p className="qp-hero__missing qp-scroll__desktop">{missingLabel}</p>
            ) : (
              <Image className="qp-scroll__desktop" src={imageSrc} alt={imageAlt} fill priority sizes="100vw" onError={() => setFailedDesktop(true)} />
            )}
            {failedMobile ? (
              <p className="qp-hero__missing qp-scroll__mobile">{missingLabel}</p>
            ) : (
              <Image className="qp-scroll__mobile" src={mobileSrc} alt={imageAlt} fill priority sizes="100vw" onError={() => setFailedMobile(true)} />
            )}
          </div>
          <div className="qp-scroll__scrim" aria-hidden="true" />
          <div className="qp-scroll__copy">
            <hr className="qp-rule" />
            <h1 className="qp-h1 qp-scroll__title">
              <span className="qp-scroll__line qp-scroll__line--a" ref={lineARef}>{title}</span>
              <span className="qp-scroll__line qp-scroll__line--b" ref={lineBRef} aria-hidden="true">{titleNext}</span>
            </h1>
            <p className="qp-body qp-scroll__body">{body}</p>
            <div>
              <Button onClick={onCta}>{cta}</Button>
              {note ? <p className="qp-small qp-scroll__note">{note}</p> : null}
            </div>
          </div>
          {captionValue && captionLabel && (
            <div className="qp-scroll__caption" ref={capRef} aria-hidden="true">
              <div className="qp-glass">
                <p className="qp-small qp-scroll__captext">
                  <span dir="ltr" className="qp-num">{captionValue}</span> {captionLabel}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
