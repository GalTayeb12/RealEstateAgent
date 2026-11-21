"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { PlanReviewSection } from "@/components/dev/plan/PlanReviewSection";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListingImage {
  id: string;
  type: "gallery" | "panorama" | "floorplan";
  label: string;
  imageData: string;
  order: number;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  location: string;
  description: string;
}

interface UnitType {
  id: string;
  unitLabel: string;
  price: number;
  quantityTotal: number;
  quantityAvailable: number;
  description: string;
  eil: number;
  ail: number;
  active: boolean;
  aomStatus: string;
  attributes: string;
  project: Project;
  images: ListingImage[];
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.5625rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid var(--qp-border)",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "var(--font-heebo, sans-serif)",
  color: "var(--qp-ink)",
  background: "var(--qp-surface)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--qp-muted)",
  marginBottom: "0.25rem",
};

const cardStyle: React.CSSProperties = {
  background: "var(--qp-surface)",
  borderRadius: "0.875rem",
  border: "1px solid var(--qp-border)",
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--qp-soft)",
  padding: "1rem 1.375rem",
  fontSize: "0.6875rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--qp-muted)",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "linear-gradient(155deg, var(--qp-primary-hover), var(--qp-primary-active))",
  color: "var(--qp-surface)",
  borderRadius: 999,
  padding: "0.5625rem 1.375rem",
  fontWeight: 600,
  fontSize: "0.875rem",
  border: "none",
  cursor: "pointer",
  fontFamily: "var(--font-heebo, sans-serif)",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UnitTypeEditPage() {
  const { m, locale } = useI18n();
  const params = useParams();
  const unitTypeId = params.unitTypeId as string;
  const router = useRouter();

  const [unitType, setUnitType] = useState<UnitType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  // Basic info form state
  const [form, setForm] = useState({
    unitLabel: "",
    price: "",
    quantityTotal: "",
    quantityAvailable: "",
    description: "",
    eil: "",
    ail: "",
  });
  const [basicSaving, setBasicSaving] = useState(false);
  const [basicError, setBasicError] = useState("");

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Auth + load
  const load = useCallback(async () => {
    const t = localStorage.getItem("token") ?? "";
    if (!t) {
      router.push("/dev/login");
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/dev/unit-types/${unitTypeId}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) {
        router.push("/dev/login");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ut: UnitType = data.unitType;
      setUnitType(ut);
      setForm({
        unitLabel: ut.unitLabel ?? "",
        price: ut.price != null ? String(ut.price) : "",
        quantityTotal: ut.quantityTotal != null ? String(ut.quantityTotal) : "",
        quantityAvailable:
          ut.quantityAvailable != null ? String(ut.quantityAvailable) : "",
        description: ut.description ?? "",
        eil: ut.eil != null ? String(ut.eil) : "",
        ail: ut.ail != null ? String(ut.ail) : "",
      });
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [unitTypeId, router]);

  useEffect(() => {
    load();
  }, [load]);

  function setField(k: keyof typeof form) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "var(--qp-ink)";
  }
  function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "var(--qp-border)";
  }

  // ── Auth helper — reads token fresh from localStorage each call ──────────────

  async function authFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const t = localStorage.getItem("token") ?? "";
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${t}`,
      },
    });
    if (res.status === 401) {
      router.push("/dev/login");
      throw new Error("Unauthorized");
    }
    return res;
  }

  // ── Save basic info ──────────────────────────────────────────────────────────

  async function saveBasicInfo(e: React.FormEvent) {
    e.preventDefault();
    setBasicError("");
    setBasicSaving(true);
    try {
      // Note: attributes (bedrooms/bathrooms/sqft etc.) are managed separately
      // and are NOT sent here — omitting the field leaves the DB value unchanged.
      const body = {
        unitLabel: form.unitLabel.trim(),
        price: form.price !== "" ? Number(form.price) : 0,
        quantityTotal: form.quantityTotal !== "" ? Number(form.quantityTotal) : 0,
        quantityAvailable:
          form.quantityAvailable !== "" ? Number(form.quantityAvailable) : 0,
        description: form.description,
        eil: form.eil !== "" ? Number(form.eil) : 0,
        ail: form.ail !== "" ? Number(form.ail) : 0,
      };

      const res = await authFetch(`/api/dev/unit-types/${unitTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setToast("Changes saved");
    } catch (err) {
      setBasicError((err as Error).message);
    } finally {
      setBasicSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--qp-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "2rem",
            height: "2rem",
            borderRadius: "50%",
            border: "2px solid rgba(18,63,64,0.08)",
            borderTopColor: "var(--qp-ink)",
            animation: "spin 0.9s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  if (loadError || !unitType) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "var(--qp-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-heebo, sans-serif)",
        }}
      >
        <div
          style={{
            background: "var(--qp-error-bg)",
            borderRadius: "0.875rem",
            padding: "1.25rem 1.5rem",
            color: "var(--qp-error)",
            fontSize: "0.9375rem",
          }}
        >
          {loadError || "Unit type not found."}
        </div>
      </main>
    );
  }


  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--qp-bg)",
        fontFamily: "var(--font-heebo, sans-serif)",
        paddingBottom: "4rem",
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .hn-prop-3col { grid-template-columns: 1fr !important; }
          .hn-prop-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--qp-ink)",
            color: "var(--qp-bg)",
            borderRadius: "0.625rem",
            padding: "0.75rem 1.25rem",
            fontSize: "0.9rem",
            fontWeight: 500,
            boxShadow: "0 4px 24px rgba(0,0,0,0.22)",
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}
        >
          {toast}
        </div>
      )}

      {/* Page header */}
      <div style={{ borderBottom: "1px solid var(--qp-border)", background: "var(--qp-surface)" }}>
        <div
          style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}
        >
          <div
            style={{
              fontFamily: "var(--font-heebo, serif)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--qp-ink)",
              marginBottom: "0.5rem",
            }}
          >
            {m.dev.portal}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-heebo, serif)",
                  fontSize: "1.875rem",
                  fontWeight: 600,
                  color: "var(--qp-ink)",
                  margin: 0,
                }}
              >
                {unitType.unitLabel}
              </h1>
              <p
                style={{
                  margin: "0.375rem 0 0",
                  color: "var(--qp-muted)",
                  fontSize: "0.9375rem",
                }}
              >
                {unitType.project.name}
                {unitType.project.location
                  ? ` · ${unitType.project.location}`
                  : ""}
              </p>
            </div>
            <a
              href="/dev/dashboard"
              style={{
                fontSize: "0.875rem",
                color: "var(--qp-ink)",
                fontWeight: 600,
                textDecoration: "none",
                alignSelf: "center",
              }}
            >
              {m.dev.dashboard}
            </a>
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: "75rem",
          margin: "0 auto",
          padding: "2rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* ── Section 1: Basic info ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            {m.dev.basic}
          </div>
          <form
            onSubmit={saveBasicInfo}
            style={{
              padding: "1.375rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Unit label */}
            <div>
              <label style={labelStyle}>{m.dev.unitLabel}</label>
              <input
                type="text"
                value={form.unitLabel}
                onChange={setField("unitLabel")}
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {/* Price + inventory */}
            <div
              className="hn-prop-3col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={labelStyle}>{m.dev.price}</label>
                <input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={setField("price")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>{m.dev.totalUnits}</label>
                <input
                  type="number"
                  min={0}
                  value={form.quantityTotal}
                  onChange={setField("quantityTotal")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>{m.dev.availableQty}</label>
                <input
                  type="number"
                  min={0}
                  value={form.quantityAvailable}
                  onChange={setField("quantityAvailable")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>

            {/* EIL + AIL */}
            <div
              className="hn-prop-2col"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.75rem",
              }}
            >
              <div>
                <label style={labelStyle}>{m.dev.minScore}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.eil}
                  onChange={setField("eil")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
              <div>
                <label style={labelStyle}>{m.dev.targetScore}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.ail}
                  onChange={setField("ail")}
                  style={inputStyle}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>{m.dev.description}</label>
              <textarea
                value={form.description}
                onChange={setField("description")}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "5rem",
                }}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {basicError && (
              <div
                style={{
                  padding: "0.625rem 0.875rem",
                  background: "var(--qp-error-bg)",
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                  color: "var(--qp-error)",
                }}
              >
                {basicError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={basicSaving}
                style={{
                  ...primaryBtnStyle,
                  opacity: basicSaving ? 0.65 : 1,
                  cursor: basicSaving ? "not-allowed" : "pointer",
                }}
              >
                {basicSaving ? m.dev.saving : m.dev.saveChanges}
              </button>
            </div>
          </form>
        </div>

        {/* ── Section 5: Apartment plan (plan twin review) ── */}
        <div style={cardStyle}>
          <div style={sectionHeaderStyle as React.CSSProperties}>
            {locale === "en" ? "Apartment plan" : "תוכנית הדירה"}
          </div>
          <PlanReviewSection unitTypeId={unitTypeId} onToast={setToast} />
        </div>
      </div>
    </main>
  );
}
