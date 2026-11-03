"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  GlassPanel,
  Notice,
  PropertyCard,
  QuietPhoto,
  QuietScrollScene,
  SectionNav,
  Skeleton,
  TextField,
  UserMenu,
} from "@/components/quiet";

const HERO_IMAGE = "/images/hero-property.png";
const HERO_DESKTOP = "/images/haveniq-hero-desktop.png";
const HERO_MOBILE = "/images/haveniq-hero-mobile.png";

const SWATCHES = [
  { key: "bg", name: "bg", value: "#F4F5F0", fill: "#F4F5F0", text: "#123F40" },
  { key: "surface", name: "surface", value: "#FFFFFF", fill: "#FFFFFF", text: "#123F40" },
  { key: "soft", name: "soft", value: "#E9EEEA", fill: "#E9EEEA", text: "#123F40" },
  { key: "ink", name: "ink", value: "#123F40", fill: "#123F40", text: "#FFFFFF" },
  { key: "muted", name: "muted", value: "#526563", fill: "#526563", text: "#FFFFFF" },
  { key: "gold", name: "gold", value: "#B5A078", fill: "#B5A078", text: "#123F40" },
  { key: "goldText", name: "gold-text", value: "#756039", fill: "#756039", text: "#FFFFFF" },
  { key: "border", name: "border", value: "#D4DED8", fill: "#D4DED8", text: "#123F40" },
  { key: "focus", name: "focus", value: "#16766F", fill: "#16766F", text: "#FFFFFF" },
  { key: "success", name: "success", value: "#246046 / #E7F2EA", fill: "#E7F2EA", text: "#246046" },
  { key: "warning", name: "warning", value: "#785716 / #FCF2D9", fill: "#FCF2D9", text: "#785716" },
  { key: "error", name: "error", value: "#9E3434 / #FBECEA", fill: "#FBECEA", text: "#9E3434" },
  { key: "info", name: "info", value: "#285F7A / #E9F2F7", fill: "#E9F2F7", text: "#285F7A" },
] as const;

function destinationFor(role: string) {
  if (role === "developer") return "/dev/dashboard";
  if (role === "seller") return "/seller/dashboard";
  if (role === "buyer") return "/results";
  return "/login";
}

export default function DesignSystemPage() {
  const { locale, setLocale, m } = useI18n();
  const q = m.quiet;
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [dialog, setDialog] = useState<"modal" | "sheet" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    fetch("/api/design-system/access", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setReady(true);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const role = typeof data.role === "string" ? data.role : "";
        window.location.replace(destinationFor(role));
      })
      .catch(() => {
        if (!cancelled) window.location.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!ready) {
    return (
      <main className="qp">
        <p className="qp-kicker" style={{ padding: 48 }}>{m.quiet.kicker}</p>
      </main>
    );
  }

  function notify(message: string) {
    setToast(message);
  }

  function savePreference(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setNameInvalid(true);
      return;
    }
    setNameInvalid(false);
    notify(q.toastBody);
  }

  const links = [
    { href: "#hero", label: q.heroNav },
    { href: "#intro", label: q.intro },
    { href: "#color", label: q.colors },
    { href: "#type", label: q.type },
    { href: "#components", label: q.components },
    { href: "#surfaces", label: q.surfaces },
    { href: "#motion", label: q.motion },
  ];

  function showComponents() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("components")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <main className="qp">
      <SectionNav
        brand="Haveniq"
        label={q.navLabel}
        links={links}
        end={
          <>
            <Link href="/dev/admin/approvals" className="qp-btn qp-btn--ghost">{q.back}</Link>
            {(["he", "en"] as const).map((code) => (
              <Button key={code} variant="ghost" className="qp-lang" aria-pressed={locale === code} onClick={() => { void setLocale(code); }}>
                {code === "he" ? "עב" : "EN"}
              </Button>
            ))}
          </>
        }
      />

      <QuietScrollScene
        imageSrc={HERO_DESKTOP}
        mobileSrc={HERO_MOBILE}
        imageAlt={q.heroAlt}
        missingLabel={q.missingPhoto}
        title={q.heroTitle}
        titleNext={q.heroTitleNext}
        body={q.heroBody}
        captionValue={q.heroCaptionValue}
        captionLabel={q.heroCaptionLabel}
        cta={q.heroCta}
        note={q.heroNote}
        onCta={showComponents}
      />

      <div className="qp-wrap">
        <section id="intro" className="qp-intro">
          <p className="qp-kicker">{q.kicker}</p>
          <h2 className="qp-h3">{q.introTitle}</h2>
          <p className="qp-body" style={{ marginTop: 12 }}>{q.introBody}</p>
        </section>

        <section id="color" className="qp-section">
          <h2 className="qp-h2">{q.colorTitle}</h2>
          <p className="qp-body" style={{ margin: "16px 0 32px" }}>{q.colorBody}</p>
          <div className="qp-swatches">
            {SWATCHES.map((swatch) => (
              <div key={swatch.key} className="qp-swatch">
                <i style={{ background: swatch.fill }} />
                <span>{q[swatch.key]}</span>
                <small>{swatch.name} · {swatch.value}</small>
              </div>
            ))}
          </div>
        </section>

        <section id="type" className="qp-section">
          <h2 className="qp-h2">{q.typeTitle}</h2>
          <p className="qp-body" style={{ margin: "16px 0 32px" }}>{q.typeBody}</p>
          <div className="qp-type">
            <p className="qp-h1">{q.heroTitle}</p>
            <p className="qp-h2" dir="ltr">{q.sampleEn}</p>
            <p className="qp-h3">{q.cardTitle}</p>
            <p className="qp-h4">{q.cardName}</p>
            <p className="qp-body">{q.heroBody}</p>
            <p className="qp-small">{q.heroNote}</p>
          </div>
        </section>

        <section id="components" className="qp-section">
          <h2 className="qp-h2">{q.components}</h2>
          <div className="qp-cols" style={{ marginTop: 32 }}>
            <div className="qp-stack">
              <div className="qp-stack">
                <h3 className="qp-h3">{q.btnTitle}</h3>
                <div className="qp-row">
                  <Button>{q.primary}</Button>
                  <Button variant="secondary">{q.secondary}</Button>
                  <Button variant="ghost">{q.ghost}</Button>
                  <Button disabled>{q.disabled}</Button>
                </div>
                <div className="qp-row">
                  <div className="qp-state"><span className="qp-small">{q.stateHover}</span><Button data-state="hover">{q.primary}</Button></div>
                  <div className="qp-state"><span className="qp-small">{q.stateFocus}</span><Button data-state="focus">{q.primary}</Button></div>
                  <div className="qp-state"><span className="qp-small">{q.stateActive}</span><Button data-state="active">{q.primary}</Button></div>
                </div>
              </div>
              <div className="qp-stack">
                <h3 className="qp-h3">{q.badgeTitle}</h3>
                <div className="qp-row">
                  <Badge tone="success">{q.available}</Badge>
                  <Badge tone="warning">{q.reserved}</Badge>
                  <Badge tone="info">{q.pending}</Badge>
                  <Badge>{q.sold}</Badge>
                  <Badge tone="error">{q.error}</Badge>
                </div>
              </div>
              <div className="qp-stack">
                <h3 className="qp-h3">{q.menuTitle}</h3>
                <UserMenu
                  name={q.menuName}
                  email={q.menuEmail}
                  role={q.menuRole}
                  openLabel={q.menuTitle}
                  items={[
                    { id: "profile", label: q.menuProfile, onSelect: () => notify(q.menuDemo) },
                    { id: "results", label: q.menuResults, onSelect: () => notify(q.menuDemo) },
                    { id: "out", label: q.menuSignOut, onSelect: () => notify(q.menuDemo) },
                  ]}
                />
              </div>
              <div className="qp-stack">
                <h3 className="qp-h3">{q.overlayTitle}</h3>
                <div className="qp-row">
                  <Button onClick={() => setDialog("modal")}>{q.openModal}</Button>
                  <Button variant="secondary" onClick={() => setDialog("sheet")}>{q.openSheet}</Button>
                  <Button variant="ghost" onClick={() => notify(q.toastBody)}>{q.showToast}</Button>
                </div>
              </div>
            </div>

            <div className="qp-stack">
              <form className="qp-stack" onSubmit={savePreference}>
                <h3 className="qp-h3">{q.fieldTitle}</h3>
                <TextField label={q.name} hint={q.nameHint} error={nameInvalid ? q.fieldError : undefined} value={name} onChange={(event) => setName(event.target.value)} />
                <TextField label={q.email} type="email" autoComplete="email" defaultValue="dana@example.com" />
                <TextField label={q.name} error={q.fieldError} defaultValue="" />
                <Button type="submit">{q.savePref}</Button>
              </form>
              <div className="qp-stack">
                <h3 className="qp-h3">{q.cardTitle}</h3>
                <PropertyCard
                  imageSrc={HERO_IMAGE}
                  imageAlt={q.heroAlt}
                  title={q.cardName}
                  price={4250000}
                  match={92}
                  reasons={[q.cardWhy1, q.cardWhy2, q.cardWhy3]}
                  matchLabel={q.matchLabel}
                  illustrative={q.illustrative}
                  missingLabel={q.missingPhoto}
                />
                <PropertyCard
                  title={q.cardName}
                  price={4250000}
                  match={92}
                  reasons={[q.cardWhy1]}
                  matchLabel={q.matchLabel}
                  illustrative={q.illustrative}
                  missingLabel={q.missingPhoto}
                  imageAlt=""
                />
              </div>
              <div className="qp-stack" style={{ maxWidth: 360 }}>
                <h3 className="qp-h3">{q.loadingTitle}</h3>
                <Skeleton width="46%" />
                <Skeleton />
                <Skeleton width="72%" />
              </div>
              <EmptyState title={q.emptyTitle} body={q.emptyBody} action={<Button onClick={() => notify(q.menuDemo)}>{q.emptyAction}</Button>} />
            </div>
          </div>
        </section>

        <section id="surfaces" className="qp-section qp-stack">
          <h2 className="qp-h2">{q.surfaceTitle}</h2>
          <p className="qp-body">{q.surfaceBody}</p>
          <div className="qp-row" style={{ alignItems: "stretch" }}>
            <div className="qp-soft" style={{ flex: "1 1 200px" }}><p className="qp-small">{q.soft}</p></div>
            <div className="qp-surface" style={{ flex: "1 1 200px" }}><p className="qp-small">{q.surface}</p></div>
            <div className="qp-elevated" style={{ flex: "1 1 200px" }}><p className="qp-small">{q.overlayTitle}</p></div>
          </div>
          <div className="qp-spaces">
            {[4, 8, 12, 16, 24, 32, 48, 64, 96, 128].map((size) => (
              <div key={size} className="qp-space">
                <b style={{ width: size, height: size }} />
                <span>{size}</span>
              </div>
            ))}
          </div>
          <div className="qp-scene">
            <QuietPhoto src={HERO_IMAGE} alt="" missingLabel={q.missingPhoto} />
            <GlassPanel>
              <p className="qp-small" style={{ color: "var(--qp-ink)" }}>{q.glassBody}</p>
            </GlassPanel>
          </div>
        </section>

        <section id="motion" className="qp-section qp-stack">
          <h2 className="qp-h2">{q.motionTitle}</h2>
          <p className="qp-body">{q.motionBody}</p>
          <p className="qp-body">{q.rtlBody}</p>
          <p className="qp-body">{q.futureBody}</p>
        </section>
      </div>

      <Dialog open={dialog !== null} mode={dialog ?? "modal"} title={q.modalTitle} closeLabel={q.close} onClose={() => setDialog(null)}>
        <p className="qp-body">{q.modalBody}</p>
      </Dialog>
      {toast && <Notice message={toast} />}
    </main>
  );
}
