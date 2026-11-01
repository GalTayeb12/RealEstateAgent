"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";
import {
  Ambient,
  Button,
  Card,
  CountUp,
  EmptyState,
  GlassPanel,
  Input,
  Overlay,
  Skeleton,
  StatusPill,
  Stepper,
  Toast,
} from "@/components/ui";
import "@/components/ui/haven.css";

function roleOf(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export default function DesignSystemPage() {
  const router = useRouter();
  const { locale, setLocale, m } = useI18n();
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState<"modal" | "sheet" | null>(null);
  const [toast, setToast] = useState(false);
  const [step, setStep] = useState(1);
  const d = m.design;

  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    const role = token ? roleOf(token) : null;
    if (role === "admin") {
      setReady(true);
      return;
    }
    if (role === "developer") router.replace("/dev/dashboard");
    else if (role === "seller") router.replace("/seller/dashboard");
    else if (role === "buyer") router.replace("/results");
    else router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!ready) {
    return (
      <main className="hq">
        <Ambient />
      </main>
    );
  }

  return (
    <main className="hq">
      <Ambient />
      <div className="hq-page">
        <header className="hq-top">
          <Link href="/dev/admin/approvals" style={{ color: "var(--hq-muted)", textDecoration: "none", fontWeight: 650 }}>
            {d.back}
          </Link>
          <div className="hq-lang" role="group" aria-label={m.lang.label}>
            {(["he", "en"] as const).map((code) => (
              <button key={code} type="button" aria-pressed={locale === code} onClick={() => { void setLocale(code); }}>
                {code === "he" ? "עב" : "EN"}
              </button>
            ))}
          </div>
        </header>

        <p className="hq-kicker hq-rise">{d.kicker}</p>
        <h1 className="hq-rise" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", animationDelay: "60ms" }}>{d.title}</h1>
        <p className="hq-lead hq-rise" style={{ animationDelay: "120ms" }}>{d.lead}</p>

        <section className="hq-section hq-rise" style={{ animationDelay: "160ms" }}>
          <h2>{d.tokens}</h2>
          <div className="hq-grid">
            <div className="hq-swatch" style={{ background: "var(--hq-night)" }}>{d.night}</div>
            <div className="hq-swatch" style={{ background: "var(--hq-glass)", backdropFilter: "blur(12px)" }}>{d.glass}</div>
            <div className="hq-swatch" style={{ background: "#143e3c", color: "var(--hq-teal)" }}>{d.teal}</div>
            <div className="hq-swatch" style={{ background: "#3a2a12", color: "var(--hq-gold)" }}>{d.gold}</div>
          </div>
          <GlassPanel className="hq-card" >
            <h3 style={{ fontSize: "1.7rem", marginBottom: "0.4rem" }}>{d.headingSample}</h3>
            <p style={{ margin: 0, color: "var(--hq-muted)", lineHeight: 1.65 }}>{d.bodySample}</p>
            <div className="hq-row" style={{ marginTop: "1.1rem" }}>
              <div>
                <div style={{ color: "var(--hq-faint)", fontSize: "0.75rem" }}>{d.numberLabel}</div>
                <div className="hq-num" style={{ fontSize: "2rem", color: "var(--hq-gold)" }}><CountUp value={85} /></div>
              </div>
              <div>
                <div style={{ color: "var(--hq-faint)", fontSize: "0.75rem" }}>{d.priceLabel}</div>
                <div className="hq-num" style={{ fontSize: "1.25rem", color: "var(--hq-gold)" }}><Money amount={2450000} /></div>
              </div>
              <span style={{ color: "var(--hq-danger)" }}>{d.danger}</span>
              <span style={{ color: "var(--hq-muted)" }}>{d.muted}</span>
            </div>
          </GlassPanel>
        </section>

        <section className="hq-section">
          <h2>{d.buttons}</h2>
          <div className="hq-row">
            <Button>{d.primary}</Button>
            <Button variant="secondary">{d.secondary}</Button>
            <Button variant="ghost">{d.ghost}</Button>
            <Button disabled>{d.primary}</Button>
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.surfaces}</h2>
          <div className="hq-grid">
            <Card kicker={d.numberLabel} title={d.cardTitle}>{d.cardBody}</Card>
            <Card title={d.background}>{d.backgroundBody}</Card>
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.status}</h2>
          <div className="hq-row">
            <StatusPill tone="available">{d.available}</StatusPill>
            <StatusPill tone="reserved">{d.reserved}</StatusPill>
            <StatusPill tone="sold">{d.sold}</StatusPill>
            <StatusPill tone="pending">{d.pending}</StatusPill>
            <StatusPill tone="danger">{d.danger}</StatusPill>
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.fields}</h2>
          <div className="hq-grid">
            <Input label={d.name} defaultValue={locale === "he" ? "דנה לוי" : "Dana Levi"} />
            <Input label={d.email} type="email" defaultValue="buyer@haveniq.demo" />
            <Input label={d.name} error={d.fieldError} />
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.motion}</h2>
          <p className="hq-lead" style={{ marginBottom: "1rem" }}>{d.motionBody}</p>
          <Stepper steps={[d.stepListen, d.stepUnderstand, d.stepScore]} current={step} />
          <div className="hq-row" style={{ marginTop: "0.8rem" }}>
            <Button variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))}>−</Button>
            <Button variant="secondary" onClick={() => setStep((n) => Math.min(2, n + 1))}>+</Button>
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.overlay}</h2>
          <div className="hq-row">
            <Button onClick={() => setOverlay("modal")}>{d.openModal}</Button>
            <Button variant="secondary" onClick={() => setOverlay("sheet")}>{d.openSheet}</Button>
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.loading}</h2>
          <div style={{ display: "grid", gap: "0.55rem", maxWidth: "18rem" }}>
            <Skeleton width="40%" />
            <Skeleton />
            <Skeleton width="72%" />
          </div>
        </section>

        <section className="hq-section">
          <h2>{d.toast}</h2>
          <Button variant="secondary" onClick={() => setToast(true)}>{d.showToast}</Button>
        </section>

        <section className="hq-section">
          <EmptyState
            title={d.emptyTitle}
            body={d.emptyBody}
            action={<Button>{d.emptyAction}</Button>}
          />
        </section>
      </div>

      {overlay && (
        <Overlay mode={overlay} title={d.modalTitle} closeLabel={d.close} onClose={() => setOverlay(null)}>
          {d.modalBody}
        </Overlay>
      )}
      {toast && <Toast message={d.toastBody} />}
    </main>
  );
}
