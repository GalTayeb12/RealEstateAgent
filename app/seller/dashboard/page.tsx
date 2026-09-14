"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellerProfile {
  userId: string;
  email: string;
  name: string | null;
  phone: string;
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
  aomStatus: string;
  attributes: string;
  active: boolean;
}

interface Project {
  id: string;
  name: string;
  location: string;
  description: string;
  status: string;
  unitTypes: UnitType[];
}

interface Offer {
  id: string;
  offeredPrice: number;
  matchScore: number | null;
  terms: string;
  status: string;
  counterPrice: number | null;
  counterTerms: string | null;
  roundNumber: number | null;
  counterExplanation: string | null;
  negotiationHistory: string;
  buyerSignature: string | null;
  developerSignature: string | null;
  createdAt: string;
  buyer: { email: string };
  unitType: { unitLabel: string; project: { name: string } };
}

type Tab = "projects" | "offers";

// ── Status helpers ─────────────────────────────────────────────────────────────

const AOM_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  available:      { label: "Available",      bg: "#E8F0EF", color: "#1F4B4A" },
  in_negotiation: { label: "In negotiation", bg: "#FBF4E4", color: "#C89B3C" },
  sold:           { label: "Sold",           bg: "#F0EDE8", color: "#6B6860" },
};

const OFFER_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "Pending",   bg: "#FBF4E4", color: "#C89B3C" },
  countered: { label: "Countered", bg: "#FBF4E4", color: "#C89B3C" },
  accepted:  { label: "Accepted",  bg: "#E8F0EF", color: "#1F4B4A" },
  rejected:  { label: "Rejected",  bg: "#FAE8E8", color: "#B04040" },
};

// ── Reusable sub-components ───────────────────────────────────────────────────

function StatusBadge({ status, map }: { status: string; map: Record<string, { label: string; bg: string; color: string }> }) {
  const s = map[status] ?? { label: status, bg: "#F0EDE8", color: "#6B6860" };
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "0.2rem 0.625rem", borderRadius: "999px", background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.25rem", fontWeight: 700, color: "#1C1B19", margin: "0 0 1rem" }}>
      {children}
    </h2>
  );
}

function ActionButton({ onClick, disabled, variant, children }: { onClick: () => void; disabled?: boolean; variant: "primary" | "ghost" | "danger"; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "#1F4B4A", color: "#fff", border: "1px solid #1F4B4A" },
    ghost:   { background: "transparent", color: "#6B6860", border: "1px solid #DDD9D3" },
    danger:  { background: "transparent", color: "#B04040", border: "1px solid #B04040" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: "0.5rem 0.875rem", borderRadius: "0.4rem", fontSize: "0.875rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, ...styles[variant] }}
    >
      {children}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#F0EDE8", border: "1px solid #DDD9D3", borderRadius: "0.4rem",
  padding: "0.5rem 0.75rem", fontSize: "1rem", outline: "none", width: "100%", boxSizing: "border-box",
};

// ── Unit Type Form sub-component ──────────────────────────────────────────────

type UnitTypeFormState = {
  unitLabel: string; price: string; quantityTotal: string; quantityAvailable: string;
  description: string; eil: string; ail: string; aomStatus: string; attributes: string;
};

function UnitTypeForm({
  form, setForm, isEdit, onCancel, onSubmit,
}: {
  form: UnitTypeFormState;
  setForm: React.Dispatch<React.SetStateAction<UnitTypeFormState>>;
  isEdit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const f = (key: keyof UnitTypeFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div style={{ padding: "1.25rem 1.375rem", background: "#FDFCFB" }}>
      <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#C89B3C", marginBottom: "1rem" }}>
        {isEdit ? "Edit unit type" : "Add unit type"}
      </div>
      <div className="hn-dev-unit-form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.875rem" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Unit label (e.g. 3-room, Penthouse)">
            <input style={inputStyle} value={form.unitLabel} onChange={f("unitLabel")} placeholder="3-room" />
          </FormField>
        </div>
        <FormField label="Price (£)">
          <input type="number" style={inputStyle} value={form.price} onChange={f("price")} placeholder="450000" />
        </FormField>
        <FormField label="Total quantity">
          <input type="number" style={inputStyle} value={form.quantityTotal} onChange={f("quantityTotal")} placeholder="1" />
        </FormField>
        <FormField label="Available quantity">
          <input type="number" style={inputStyle} value={form.quantityAvailable} onChange={f("quantityAvailable")} placeholder="1" />
        </FormField>
        <FormField label="Min. match required">
          <input type="number" style={inputStyle} value={form.eil} onChange={f("eil")} placeholder="55" />
        </FormField>
        <FormField label="Target match">
          <input type="number" style={inputStyle} value={form.ail} onChange={f("ail")} placeholder="80" />
        </FormField>
        <FormField label="Status">
          <select style={inputStyle} value={form.aomStatus} onChange={f("aomStatus")}>
            <option value="available">Available</option>
            <option value="in_negotiation">In negotiation</option>
            <option value="sold">Sold</option>
          </select>
        </FormField>
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Description">
            <input style={inputStyle} value={form.description} onChange={f("description")} placeholder="Short description" />
          </FormField>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FormField label="Attributes (JSON)">
            <input style={{ ...inputStyle, fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem" }}
              value={form.attributes} onChange={f("attributes")} placeholder='{"bedrooms":3,"sqft":1050}' />
          </FormField>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", marginTop: "1rem" }}>
        <ActionButton onClick={onCancel} variant="ghost">Cancel</ActionButton>
        <ActionButton onClick={onSubmit} variant="primary">{isEdit ? "Save changes" : "Add listing"}</ActionButton>
      </div>
    </div>
  );
}

// ── Blank forms ───────────────────────────────────────────────────────────────

const blankProjectForm = { name: "", location: "", description: "" };
const blankUnitTypeForm: UnitTypeFormState = {
  unitLabel: "", price: "", quantityTotal: "1", quantityAvailable: "1",
  description: "", eil: "", ail: "", aomStatus: "available", attributes: "",
};

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function SellerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(blankProjectForm);
  const [addingUnitTypeToProjectId, setAddingUnitTypeToProjectId] = useState<string | null>(null);
  const [unitTypeForm, setUnitTypeForm] = useState(blankUnitTypeForm);

  const [counteringOfferId, setCounteringOfferId] = useState<string | null>(null);
  const [offerCounter, setOfferCounter] = useState({ counterPrice: "", counterTerms: "", counterExplanation: "" });

  const token = useCallback(() => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""), []);
  const auth = useCallback(() => ({ Authorization: `Bearer ${token()}` }), [token]);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    const r = await fetch("/api/seller/projects", { headers: auth() });
    const d = await r.json();
    setProjects(d.projects ?? []);
  }, [auth]);

  const loadOffers = useCallback(async () => {
    const r = await fetch("/api/seller/offers", { headers: auth() });
    const d = await r.json();
    setOffers(d.offers ?? []);
  }, [auth]);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }

    fetch("/api/seller/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => {
        if (!r.ok) { router.push("/login"); return null; }
        return r.json();
      })
      .then(me => {
        if (!me) return;
        setProfile(me);
        loadProjects();
        loadOffers();
      })
      .catch(() => router.push("/login"));
  }, [router, token, loadProjects, loadOffers]);

  useEffect(() => {
    if (tab === "projects") loadProjects();
    if (tab === "offers")   loadOffers();
  }, [tab, loadProjects, loadOffers]);

  // ── Project CRUD ────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submitProjectForm() {
    if (!projectForm.name.trim()) { alert("Project name is required"); return; }
    const res = await fetch("/api/seller/projects", {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(projectForm),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Save failed"); return; }
    const { project } = await res.json();
    setShowProjectForm(false);
    setProjectForm(blankProjectForm);
    setExpandedProjectIds(prev => new Set(prev).add(project.id));
    loadProjects();
  }

  // ── Unit type CRUD ──────────────────────────────────────────────────────────

  function startAddUnitType(projectId: string) {
    setUnitTypeForm(blankUnitTypeForm);
    setAddingUnitTypeToProjectId(projectId);
    setExpandedProjectIds(prev => new Set(prev).add(projectId));
  }

  function cancelUnitTypeForm() {
    setAddingUnitTypeToProjectId(null);
    setUnitTypeForm(blankUnitTypeForm);
  }

  async function submitUnitTypeForm(projectId: string) {
    let attrs = {};
    try { if (unitTypeForm.attributes.trim()) attrs = JSON.parse(unitTypeForm.attributes); } catch { alert("Attributes must be valid JSON"); return; }

    const body = {
      unitLabel: unitTypeForm.unitLabel,
      price: Number(unitTypeForm.price) || 0,
      quantityTotal: Number(unitTypeForm.quantityTotal) || 1,
      quantityAvailable: Number(unitTypeForm.quantityAvailable) || Number(unitTypeForm.quantityTotal) || 1,
      description: unitTypeForm.description,
      eil: Number(unitTypeForm.eil),
      ail: Number(unitTypeForm.ail),
      aomStatus: unitTypeForm.aomStatus,
      attributes: attrs,
    };

    const res = await fetch(`/api/seller/projects/${projectId}/unit-types`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Save failed"); return; }
    cancelUnitTypeForm();
    loadProjects();
  }

  async function deactivateUnitType(id: string) {
    if (!confirm("Deactivate this listing?")) return;
    await fetch(`/api/seller/unit-types/${id}`, { method: "DELETE", headers: auth() });
    loadProjects();
  }

  // ── Offer responses ─────────────────────────────────────────────────────────

  async function respondOffer(id: string, action: "accept" | "reject" | "counter") {
    const body: Record<string, unknown> = { action };
    if (action === "counter") {
      body.counterPrice = Number(offerCounter.counterPrice);
      body.counterTerms = offerCounter.counterTerms;
      body.counterExplanation = offerCounter.counterExplanation;
    }
    const res = await fetch(`/api/seller/offers/${id}/respond`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        try { const d = JSON.parse(text); msg = d.error ?? d.message ?? text.slice(0, 300) ?? msg; } catch { msg = text.slice(0, 300) || msg; }
      } catch { /* network error */ }
      alert(msg);
      return;
    }
    if (action === "accept") {
      router.push(`/deal/${id}`);
      return;
    }
    setCounteringOfferId(null);
    setOfferCounter({ counterPrice: "", counterTerms: "", counterExplanation: "" });
    loadOffers();
  }

  if (!profile) return null;

  const pendingOffers = offers.filter(o => o.status === "pending").length;
  const totalProjects = projects.length;

  return (
    <main style={{ minHeight: "100vh", background: "#F7F5F1", fontFamily: "var(--font-inter, sans-serif)" }}>
      <style>{`
        @media (max-width: 640px) {
          .hn-dev-topbar-inner { flex-wrap: wrap; gap: 0.5rem; padding-top: 0.5rem; padding-bottom: 0.5rem; }
          .hn-dev-proj-grid      { grid-template-columns: 1fr !important; }
          .hn-dev-counter-grid   { grid-template-columns: 1fr !important; }
          .hn-dev-unit-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #DDD9D3", position: "sticky", top: "3.25rem", zIndex: 10 }}>
        <div className="hn-dev-topbar-inner" style={{ maxWidth: "62rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "3.25rem" }}>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1C1B19" }}>
            {profile.name ?? profile.email}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#6B6860" }}>{profile.phone}</span>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "0.2rem 0.625rem", borderRadius: "999px", background: "#E8F0EF", color: "#1F4B4A" }}>
              Seller
            </span>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ maxWidth: "62rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", gap: 0 }}>
          {([
            ["projects", "My Projects",     totalProjects],
            ["offers",   "Incoming Offers", pendingOffers > 0 ? pendingOffers : offers.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "0.75rem 1.25rem", border: "none", background: "none",
                fontSize: "0.9375rem", fontWeight: tab === key ? 600 : 400,
                color: tab === key ? "#1F4B4A" : "#6B6860",
                borderBottom: tab === key ? "2px solid #1F4B4A" : "2px solid transparent",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem",
              }}
            >
              {label}
              {count > 0 && (
                <span style={{
                  fontSize: "0.6875rem", fontWeight: 700, minWidth: "1.25rem", height: "1.25rem",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "999px", padding: "0 0.3rem",
                  background: tab === key ? "#1F4B4A" : "#E8E4DF",
                  color: tab === key ? "#fff" : "#6B6860",
                }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "62rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        {/* ── MY PROJECTS ── */}
        {tab === "projects" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
              <SectionHeading>My Projects</SectionHeading>
              <button
                onClick={() => { setShowProjectForm(true); setProjectForm(blankProjectForm); }}
                style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", background: "#1F4B4A", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
              >
                + New listing
              </button>
            </div>

            {showProjectForm && (
              <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", borderTop: "3px solid #C89B3C", padding: "1.5rem", marginBottom: "1.25rem" }}>
                <h3 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 700, color: "#1C1B19", margin: "0 0 1rem" }}>New project</h3>
                <div className="hn-dev-proj-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <FormField label="Project name">
                      <input style={inputStyle} value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. My Property" />
                    </FormField>
                  </div>
                  <FormField label="Location / address">
                    <input style={inputStyle} value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. 12 High Street, London" />
                  </FormField>
                  <FormField label="Description">
                    <input style={inputStyle} value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
                  </FormField>
                </div>
                <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <ActionButton onClick={() => { setShowProjectForm(false); setProjectForm(blankProjectForm); }} variant="ghost">Cancel</ActionButton>
                  <ActionButton onClick={submitProjectForm} variant="primary">Create project</ActionButton>
                </div>
              </div>
            )}

            {projects.length === 0 && !showProjectForm && (
              <p style={{ color: "#6B6860", textAlign: "center", padding: "3rem 0" }}>No listings yet — create your first listing above.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {projects.map(project => {
                const isExpanded = expandedProjectIds.has(project.id);
                const activeUnitTypes = project.unitTypes.filter(ut => ut.active);
                const availableCount = activeUnitTypes.filter(ut => ut.aomStatus === "available").length;

                return (
                  <div key={project.id} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
                    <button
                      onClick={() => toggleExpand(project.id)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "1.25rem 1.375rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.0625rem", fontWeight: 700, color: "#1C1B19" }}>{project.name}</span>
                        </div>
                        {project.location && (
                          <p style={{ margin: "0.2rem 0 0", fontSize: "0.875rem", color: "#6B6860" }}>{project.location}</p>
                        )}
                        <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem", color: "#9A958F" }}>
                          {project.unitTypes.length === 0
                            ? "No unit types yet"
                            : `${project.unitTypes.length} unit type${project.unitTypes.length !== 1 ? "s" : ""}${availableCount > 0 ? ` · ${availableCount} available` : ""}`
                          }
                        </p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A958F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #F0EDE8" }}>
                        {project.unitTypes.length === 0 ? (
                          <p style={{ padding: "1rem 1.375rem", fontSize: "0.875rem", color: "#9A958F", margin: 0 }}>No unit types yet — add one below.</p>
                        ) : (
                          <div>
                            {project.unitTypes.map((ut, idx) => {
                              let attrs: Record<string, unknown> = {};
                              try { attrs = JSON.parse(ut.attributes); } catch { /* ok */ }
                              return (
                                <div key={ut.id} style={{
                                  padding: "1rem 1.375rem",
                                  borderTop: idx === 0 ? "none" : "1px solid #F7F5F1",
                                  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem",
                                  background: ut.active ? "transparent" : "#FDFCFB",
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                      <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#1F4B4A", background: "#E8F0EF", padding: "0.15rem 0.5rem", borderRadius: "0.25rem" }}>
                                        {ut.unitLabel}
                                      </span>
                                      {ut.price > 0 && (
                                        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.9375rem", fontWeight: 700, color: "#1C1B19" }}>
                                          £{ut.price.toLocaleString()}
                                        </span>
                                      )}
                                      {ut.quantityTotal > 0 && (
                                        <span style={{ fontSize: "0.8125rem", color: "#6B6860" }}>
                                          {ut.quantityAvailable}/{ut.quantityTotal} avail.
                                        </span>
                                      )}
                                      <StatusBadge status={ut.aomStatus} map={AOM_STATUS} />
                                    </div>
                                    {ut.description && (
                                      <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#6B6860" }}>{ut.description}</p>
                                    )}
                                    <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.375rem", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.75rem", color: "#6B6860" }}>
                                      <span>Min. match <strong style={{ color: "#1C1B19" }}>{ut.eil}</strong></span>
                                      <span>Target match <strong style={{ color: "#1C1B19" }}>{ut.ail}</strong></span>
                                      {Object.entries(attrs).slice(0, 3).map(([k, v]) => (
                                        <span key={k}>{k} <strong style={{ color: "#1C1B19" }}>{String(v)}</strong></span>
                                      ))}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                                    <ActionButton onClick={() => deactivateUnitType(ut.id)} variant="danger">Deactivate</ActionButton>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {addingUnitTypeToProjectId === project.id && (
                          <div style={{ borderTop: "1px solid #F0EDE8" }}>
                            <UnitTypeForm
                              form={unitTypeForm}
                              setForm={setUnitTypeForm}
                              isEdit={false}
                              onCancel={cancelUnitTypeForm}
                              onSubmit={() => submitUnitTypeForm(project.id)}
                            />
                          </div>
                        )}

                        {addingUnitTypeToProjectId !== project.id && (
                          <div style={{ borderTop: "1px solid #F0EDE8", padding: "0.875rem 1.375rem" }}>
                            <button
                              onClick={() => startAddUnitType(project.id)}
                              style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1F4B4A", background: "none", border: "1px dashed #B8D4D3", borderRadius: "0.4rem", padding: "0.4rem 0.875rem", cursor: "pointer" }}
                            >
                              + Add unit type
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INCOMING OFFERS ── */}
        {tab === "offers" && (
          <div>
            <SectionHeading>Incoming Offers</SectionHeading>
            {offers.length === 0 && <p style={{ color: "#6B6860", textAlign: "center", padding: "3rem 0" }}>No offers received yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {offers.map(offer => {
                const canAct = offer.status === "pending";
                const awaitingBuyer = offer.status === "countered";
                const listingLabel = `${offer.unitType.project.name} — ${offer.unitType.unitLabel}`;
                const dealComplete = offer.status === "accepted" && !!offer.buyerSignature && !!offer.developerSignature;
                return (
                  <div key={offer.id} style={{ background: "#fff", borderRadius: "0.875rem", border: `${dealComplete ? "2px" : "1px"} solid ${dealComplete ? "#C89B3C" : "#DDD9D3"}`, overflow: "hidden", borderTop: dealComplete ? "4px solid #C89B3C" : undefined }}>
                    <div style={{ padding: "1.25rem 1.375rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.0625rem", fontWeight: 700, color: "#1C1B19" }}>{listingLabel}</span>
                            {dealComplete ? (
                              <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "0.2rem 0.625rem", borderRadius: "999px", background: "#FBF4E4", color: "#C89B3C", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#1F4B4A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="1.5 6 4.5 9 10.5 3"/>
                                </svg>
                                Deal complete
                              </span>
                            ) : (
                              <StatusBadge status={offer.status} map={OFFER_STATUS} />
                            )}
                          </div>
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#6B6860" }}>
                            From <strong style={{ color: "#1C1B19" }}>{offer.buyer.email}</strong>
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.6875rem", color: "#6B6860", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Offered price</div>
                          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.5rem", fontWeight: 700, color: "#1F4B4A" }}>£{offer.offeredPrice.toLocaleString()}</div>
                          {offer.matchScore != null && (
                            <div style={{ fontSize: "0.75rem", color: "#6B6860", marginTop: "0.25rem" }}>
                              Match score: <strong style={{ color: "#1C1B19" }}>{offer.matchScore.toFixed(1)}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "#1C1B19", background: "#F7F5F1", borderRadius: "0.375rem", padding: "0.625rem 0.75rem", lineHeight: 1.55 }}>
                        {offer.terms}
                      </p>

                      {(offer.roundNumber ?? 0) >= 2 && offer.status === "pending" && (
                        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#EAF3F2", borderRadius: "0.5rem", borderLeft: "3px solid #1F4B4A" }}>
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#1F4B4A", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                            Buyer&apos;s counter — £{offer.offeredPrice.toLocaleString()}
                          </div>
                          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#6B6860", fontStyle: "italic" }}>
                            Final round — accept or reject only
                          </p>
                        </div>
                      )}

                      {offer.counterPrice != null && (
                        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#FBF4E4", borderRadius: "0.5rem", borderLeft: "3px solid #C89B3C" }}>
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#C89B3C", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                            Your counter — £{offer.counterPrice?.toLocaleString()}
                          </div>
                          <p style={{ margin: 0, fontSize: "0.875rem", color: "#1C1B19" }}>{offer.counterTerms}</p>
                          {offer.counterExplanation && (
                            <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem", color: "#6B6860", fontStyle: "italic" }}>&ldquo;{offer.counterExplanation}&rdquo;</p>
                          )}
                        </div>
                      )}

                      {awaitingBuyer && (
                        <div style={{ marginTop: "1rem", padding: "0.625rem 0.875rem", background: "#EAF3F2", borderRadius: "0.5rem", border: "1px solid #C0DBD9", fontSize: "0.8125rem", color: "#1F4B4A", fontWeight: 500 }}>
                          Awaiting buyer&apos;s response to your counter…
                        </div>
                      )}

                      {offer.status === "accepted" && (
                        <div style={{ marginTop: "1rem" }}>
                          <Link
                            href={`/deal/${offer.id}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.125rem", borderRadius: 999, background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", fontSize: "0.8125rem", fontWeight: 700, textDecoration: "none" }}
                          >
                            {dealComplete ? "View signed contract →" : "View Deal Room →"}
                          </Link>
                        </div>
                      )}

                      {canAct && (
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
                          <ActionButton onClick={() => respondOffer(offer.id, "accept")} variant="primary">Accept</ActionButton>
                          <ActionButton onClick={() => respondOffer(offer.id, "reject")} variant="danger">Reject</ActionButton>
                          {(offer.roundNumber ?? 0) < 2 && (
                            <ActionButton
                              onClick={() => { setCounteringOfferId(counteringOfferId === offer.id ? null : offer.id); setOfferCounter({ counterPrice: "", counterTerms: "", counterExplanation: "" }); }}
                              variant="ghost"
                            >
                              {counteringOfferId === offer.id ? "Cancel counter" : "Counter"}
                            </ActionButton>
                          )}
                        </div>
                      )}
                    </div>

                    {counteringOfferId === offer.id && (offer.roundNumber ?? 0) < 2 && (
                      <div style={{ borderTop: "1px solid #F0EDE8", padding: "1.125rem 1.375rem", background: "#FDFCFB", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#C89B3C" }}>Counter offer</div>
                        <div className="hn-dev-counter-grid" style={{ display: "grid", gridTemplateColumns: "8rem 1fr", gap: "0.75rem" }}>
                          <FormField label="Counter price (£)">
                            <input type="number" step={1000} value={offerCounter.counterPrice} onChange={e => setOfferCounter(f => ({ ...f, counterPrice: e.target.value }))}
                              style={{ ...inputStyle, fontFamily: "var(--font-jetbrains, monospace)" }} />
                          </FormField>
                          <FormField label="Counter terms">
                            <input value={offerCounter.counterTerms} onChange={e => setOfferCounter(f => ({ ...f, counterTerms: e.target.value }))}
                              placeholder="State your counter terms…" style={inputStyle} />
                          </FormField>
                        </div>
                        <FormField label="Explanation (required — shown to buyer)">
                          <input
                            value={offerCounter.counterExplanation}
                            onChange={e => setOfferCounter(f => ({ ...f, counterExplanation: e.target.value }))}
                            placeholder="e.g. The property was recently renovated"
                            style={inputStyle}
                          />
                        </FormField>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <ActionButton onClick={() => respondOffer(offer.id, "counter")} variant="primary">Send counter</ActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
