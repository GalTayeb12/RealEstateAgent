"use client";

import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import "./vision.css";

export type VisionTheme = "night" | "day";
export type DisplayFace = "bellefair" | "frank" | "noto";

const TOWERS: Array<[number, number, number, number]> = [
  [0, 230, 86, 190],
  [78, 150, 52, 270],
  [136, 196, 74, 224],
  [216, 96, 44, 324],
  [266, 168, 84, 252],
  [356, 48, 34, 372],
  [396, 128, 92, 292],
  [496, 78, 58, 342],
  [562, 188, 108, 232],
  [678, 58, 38, 362],
  [724, 138, 86, 282],
  [818, 88, 68, 332],
  [894, 176, 102, 244],
  [1004, 36, 46, 384],
  [1058, 118, 78, 302],
  [1144, 156, 72, 264],
  [1224, 70, 52, 350],
  [1284, 198, 156, 222],
];

export function Skyline({ className = "" }: { className?: string }) {
  const windows = TOWERS.flatMap(([x, y, w, h], tower) => {
    const lights = [];
    const cols = Math.max(1, Math.floor((w - 12) / 14));
    const rows = Math.max(1, Math.floor((h - 18) / 18));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if ((tower + row + col) % 2 !== 0) continue;
        lights.push(
          <rect
            key={`${tower}-${row}-${col}`}
            x={x + 8 + col * 14}
            y={y + 12 + row * 18}
            width={6}
            height={8}
            fill={(row + col) % 4 === 0 ? "#e7b07a" : "#f4ddb0"}
          />,
        );
      }
    }
    return lights;
  });

  return (
    <svg className={className} viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <g fill="#101820">
        {TOWERS.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
      <g className="vx-windows">{windows}</g>
    </svg>
  );
}

export function Theme({
  theme,
  className = "",
  children,
}: {
  theme: VisionTheme;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`vx vx--${theme} ${className}`} data-theme={theme}>
      {children}
    </div>
  );
}

export function VGlass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`vx-glass vx-lift ${className}`}>{children}</div>;
}

export function VCard({ kicker, title, children }: { kicker?: string; title?: string; children: ReactNode }) {
  return (
    <section className="vx-glass vx-lift vx-card">
      {kicker && <div className="vx-kicker">{kicker}</div>}
      {title && <h3>{title}</h3>}
      <div className="vx-muted">{children}</div>
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function VButton({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type="button" className={`vx-btn vx-btn--${variant} ${className}`} {...rest}>
      {children}
    </button>
  );
}

const PILL = {
  available: "vx-pill vx-pill--available",
  reserved: "vx-pill vx-pill--reserved",
  sold: "vx-pill vx-pill--sold",
  pending: "vx-pill vx-pill--pending",
  danger: "vx-pill vx-pill--danger",
} as const;

export function VPill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={PILL[tone]}>{children}</span>;
}

export function VInput({
  label,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="vx-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} {...rest} />
      {error && <span className="vx-field__error">{error}</span>}
    </div>
  );
}

export function VStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="vx-steps">
      {steps.map((label, index) => (
        <li key={label} className={index <= current ? "vx-step vx-step--on" : "vx-step"} aria-current={index === current ? "step" : undefined}>
          <small>0{index + 1}</small>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function VSkeleton({ width = "100%" }: { width?: string }) {
  return <div className="vx-skel" style={{ width }} aria-hidden />;
}

export function VEmpty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="vx-glass vx-card" style={{ textAlign: "center" }}>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <div style={{ marginTop: "0.9rem" }}>{action}</div>}
    </div>
  );
}

export function VCount({ value }: { value: number }) {
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
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="vx-num">{shown}</span>;
}

export function VToast({ message }: { message: string }) {
  return (
    <div className="vx vx--day vx-toast vx-glass" role="status">
      {message}
    </div>
  );
}

export function VOverlay({
  theme,
  mode,
  title,
  children,
  onClose,
  closeLabel,
}: {
  theme: VisionTheme;
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
    <div className={mode === "sheet" ? "vx-overlay vx-overlay--sheet" : "vx-overlay"} onClick={onClose}>
      <div
        className={`vx vx--${theme} vx-glass vx-dialog`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="vx-display" style={{ fontSize: "1.45rem", margin: "0 0 0.4rem" }}>{title}</h3>
        <p className="vx-muted">{children}</p>
        <div style={{ marginTop: "1rem" }}>
          <VButton variant="secondary" onClick={onClose}>{closeLabel}</VButton>
        </div>
      </div>
    </div>
  );
}
