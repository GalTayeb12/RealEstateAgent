"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DevProfile {
  companyName: string;
  crn: string;
  contactName: string;
  crnStatus: string;
  qualityScore: number;
  email: string;
  userId: string;
  googleConnected: boolean;
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
  hasTeaserVideo?: boolean;
}

interface Reservation {
  id: string;
  offeredPrice: number;
  depositPaid: boolean;
  buyerSignature: string | null;
  developerSignature: string | null;
  createdAt: string;
  buyer: { email: string };
  unitType: { unitLabel: string; price: number; project: { name: string } };
}

interface LeverageGroup {
  id: string;
  memberCount: number;
  requestedDiscountPercent: number;
  requestedTerms: string;
  status: string;
  counterDiscountPercent: number | null;
  counterTerms: string | null;
  createdAt: string;
  unitType: { unitLabel: string; project: { name: string } };
}

type Tab = "projects" | "reservations" | "groups";

interface ImportResult {
  created: number;
  updated: number;
  skipped: Array<{ row: number; reason: string }>;
}

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

// ── Main dashboard ────────────────────────────────────────────────────────────

const blankProjectForm = { name: "", location: "", description: "" };
const blankUnitTypeForm = {
  unitLabel: "", price: "", quantityTotal: "", quantityAvailable: "",
  description: "", eil: "", ail: "", aomStatus: "available", attributes: "",
};

export default function DevDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<DevProfile | null>(null);
  const [tab, setTab] = useState<Tab>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [groups, setGroups] = useState<LeverageGroup[]>([]);

  // Project expand/collapse
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  // Project form state
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState(blankProjectForm);

  // Unit type form state
  const [addingUnitTypeToProjectId, setAddingUnitTypeToProjectId] = useState<string | null>(null);
  const [unitTypeForm, setUnitTypeForm] = useState(blankUnitTypeForm);

  // Counter form state — groups
  const [counteringGroupId, setCounteringGroupId] = useState<string | null>(null);
  const [groupCounter, setGroupCounter] = useState({ counterDiscountPercent: "", counterTerms: "" });

  // Project video state
  const [projectVideoFiles, setProjectVideoFiles] = useState<Record<string, File | null>>({});
  const [projectVideoUploading, setProjectVideoUploading] = useState<Set<string>>(new Set());

  // Import state
  const [importingProjectId, setImportingProjectId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);


  const token = useCallback(() => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""), []);
  const auth = useCallback(() => ({ Authorization: `Bearer ${token()}` }), [token]);

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    const r = await fetch("/api/dev/projects", { headers: auth() });
    const d = await r.json();
    setProjects(d.projects ?? []);
  }, [auth]);

  const loadReservations = useCallback(async () => {
    const r = await fetch("/api/dev/reservations", { headers: auth() });
    const d = await r.json();
    setReservations(d.reservations ?? []);
  }, [auth]);

  const loadGroups = useCallback(async () => {
    const r = await fetch("/api/dev/leverage-groups", { headers: auth() });
    const d = await r.json();
    setGroups(d.groups ?? []);
  }, [auth]);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }

    fetch("/api/dev/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(me => {
        if (me.crnStatus === "pending")  { router.push("/dev/pending");  return; }
        if (me.crnStatus === "rejected") { router.push("/dev/rejected"); return; }
        setProfile({ ...me, userId: me.userId ?? "", googleConnected: me.googleConnected ?? false });
        loadProjects(); loadReservations(); loadGroups();
      })
      .catch(() => router.push("/login"));
  }, [router, token, loadProjects, loadReservations, loadGroups]);

  useEffect(() => {
    if (tab === "projects")      loadProjects();
    if (tab === "reservations")  loadReservations();
    if (tab === "groups")        loadGroups();
  }, [tab, loadProjects, loadReservations, loadGroups]);

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
    const res = await fetch("/api/dev/projects", {
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

    const res = await fetch(`/api/dev/projects/${projectId}/unit-types`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Save failed"); return; }
    cancelUnitTypeForm();
    loadProjects();
  }

  async function deactivateUnitType(id: string) {
    if (!confirm("Deactivate this unit type?")) return;
    await fetch(`/api/dev/unit-types/${id}`, { method: "DELETE", headers: auth() });
    loadProjects();
  }

  // ── Group responses ─────────────────────────────────────────────────────────

  async function respondGroup(id: string, action: "accept" | "reject" | "counter") {
    const body: Record<string, unknown> = { action };
    if (action === "counter") { body.counterDiscountPercent = Number(groupCounter.counterDiscountPercent); body.counterTerms = groupCounter.counterTerms; }
    const res = await fetch(`/api/dev/leverage-groups/${id}/respond`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Failed"); return; }
    setCounteringGroupId(null); setGroupCounter({ counterDiscountPercent: "", counterTerms: "" }); loadGroups();
  }

  // ── Project video upload ────────────────────────────────────────────────────

  const SIZE_VIDEO_WARN_MB = 50;

  async function uploadProjectVideo(projectId: string) {
    const file = projectVideoFiles[projectId];
    if (!file) return;
    setProjectVideoUploading(prev => new Set(prev).add(projectId));
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/dev/projects/${projectId}/video`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ videoData: dataUrl }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error ?? "Upload failed"); return; }
      setProjectVideoFiles(prev => ({ ...prev, [projectId]: null }));
      loadProjects();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProjectVideoUploading(prev => { const s = new Set(prev); s.delete(projectId); return s; });
    }
  }

  async function removeProjectVideo(projectId: string) {
    if (!confirm("Remove this project video?")) return;
    const res = await fetch(`/api/dev/projects/${projectId}/video`, {
      method: "DELETE",
      headers: auth(),
    });
    if (!res.ok) { const d = await res.json(); alert(d.error ?? "Remove failed"); return; }
    loadProjects();
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  function startImport(projectId: string) {
    setImportingProjectId(projectId);
    setImportFile(null);
    setImportResult(null);
  }

  function cancelImport() {
    setImportingProjectId(null);
    setImportFile(null);
    setImportResult(null);
  }

  async function runImport(projectId: string) {
    if (!importFile) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const isCsv = importFile.name.toLowerCase().endsWith(".csv");
      let body: Record<string, string>;

      if (isCsv) {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsText(importFile);
        });
        body = { csvData: text };
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(importFile);
        });
        // Strip the data:...;base64, prefix, send just the base64
        const base64 = dataUrl.split(",")[1] ?? dataUrl;
        body = { xlsxData: base64 };
      }

      const res = await fetch(`/api/dev/projects/${projectId}/import`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error ?? "Import failed"); return; }
      setImportResult(d as ImportResult);
      loadProjects();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  if (!profile) return null;

  const pendingGroups = groups.filter(g => g.status === "pending").length;
  const totalProjects = projects.length;

  // ── Render ──────────────────────────────────────────────────────────────────

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

      {/* Top bar — sits below the global TopNav (sticky top: 3.25rem) */}
      <div style={{ background: "#fff", borderBottom: "1px solid #DDD9D3", position: "sticky", top: "3.25rem", zIndex: 10 }}>
        <div className="hn-dev-topbar-inner" style={{ maxWidth: "62rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: "3.25rem" }}>
          <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#1C1B19" }}>{profile.companyName}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {/* Google Calendar connection indicator */}
            {profile.googleConnected ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", color: "#1F4B4A" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F4B4A", display: "inline-block" }} />
                Google Calendar connected
              </div>
            ) : (
              <a
                href={`/api/auth/google?userId=${profile.userId}`}
                style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", color: "#6B6860", textDecoration: "none", border: "1px solid #DDD9D3", borderRadius: "999px", padding: "0.2rem 0.625rem" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#DDD9D3", display: "inline-block" }} />
                Connect Google Calendar
              </a>
            )}
            <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860" }}>Quality score</span>
            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1rem", fontWeight: 700, color: "#C89B3C", background: "#FBF4E4", padding: "0.2rem 0.625rem", borderRadius: "0.375rem", border: "1px solid #F5E9C4" }}>
              {profile.qualityScore}
            </span>
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ maxWidth: "62rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", gap: 0 }}>
          {([
            ["projects",     "My Projects",   totalProjects],
            ["reservations", "Reservations",  reservations.length],
            ["groups",       "Leverage Groups", pendingGroups > 0 ? pendingGroups : groups.length],
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
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <button
                  onClick={() => { setShowProjectForm(true); setProjectForm(blankProjectForm); }}
                  style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", background: "#1F4B4A", color: "#fff", border: "none", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}
                >
                  + New project
                </button>
              </div>
            </div>

            {/* New project form */}
            {showProjectForm && (
              <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", borderTop: "3px solid #C89B3C", padding: "1.5rem", marginBottom: "1.25rem" }}>
                <h3 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 700, color: "#1C1B19", margin: "0 0 1rem" }}>New project</h3>
                <div className="hn-dev-proj-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <FormField label="Project name">
                      <input style={inputStyle} value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Riverside Towers" />
                    </FormField>
                  </div>
                  <FormField label="Location / address">
                    <input style={inputStyle} value={projectForm.location} onChange={e => setProjectForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Riverside Quarter, London E1W" />
                  </FormField>
                  <FormField label="Description">
                    <input style={inputStyle} value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="Short project description" />
                  </FormField>
                </div>
                <div style={{ display: "flex", gap: "0.625rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                  <ActionButton onClick={() => { setShowProjectForm(false); setProjectForm(blankProjectForm); }} variant="ghost">Cancel</ActionButton>
                  <ActionButton onClick={submitProjectForm} variant="primary">Create project</ActionButton>
                </div>
              </div>
            )}

            {projects.length === 0 && !showProjectForm && (
              <p style={{ color: "#6B6860", textAlign: "center", padding: "3rem 0" }}>No projects yet — create your first project above.</p>
            )}

            {/* Project cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {projects.map(project => {
                const isExpanded = expandedProjectIds.has(project.id);
                const activeUnitTypes = project.unitTypes.filter(ut => ut.active);
                const availableCount = activeUnitTypes.filter(ut => ut.aomStatus === "available").length;

                return (
                  <div key={project.id} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
                    {/* Project header — clickable to expand */}
                    <button
                      onClick={() => toggleExpand(project.id)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "1.25rem 1.375rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.0625rem", fontWeight: 700, color: "#1C1B19" }}>{project.name}</span>
                          {project.status === "inactive" && (
                            <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "999px", background: "#F0EDE8", color: "#6B6860", textTransform: "uppercase", letterSpacing: "0.07em" }}>Inactive</span>
                          )}
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
                      {/* Chevron */}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9A958F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #F0EDE8" }}>
                        {/* Unit type rows */}
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
                                      <span>Min. match required <strong style={{ color: "#1C1B19" }}>{ut.eil}</strong></span>
                                      <span>Target match <strong style={{ color: "#1C1B19" }}>{ut.ail}</strong></span>
                                      {Object.entries(attrs).slice(0, 3).map(([k, v]) => (
                                        <span key={k}>{k} <strong style={{ color: "#1C1B19" }}>{String(v)}</strong></span>
                                      ))}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                                    <Link
                                      href={`/dev/properties/${ut.id}`}
                                      style={{ padding: "0.4rem 0.875rem", borderRadius: "0.4rem", fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", border: "1px solid #DDD9D3", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                                    >
                                      Edit & manage photos →
                                    </Link>
                                    <ActionButton onClick={() => deactivateUnitType(ut.id)} variant="danger">Deactivate</ActionButton>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Add unit type inline form */}
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

                        {/* ── Project video section ── */}
                        <div style={{ borderTop: "1px solid #F0EDE8", padding: "0.875rem 1.375rem", background: "#F7F5F1" }}>
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9A958F", marginBottom: "0.625rem" }}>
                            Project video
                          </div>
                          {project.hasTeaserVideo ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.8125rem", color: "#1F4B4A", fontWeight: 600 }}>Video uploaded</span>
                              <button
                                onClick={() => removeProjectVideo(project.id)}
                                style={{ fontSize: "0.75rem", fontWeight: 600, color: "#B04040", background: "none", border: "1px solid #B04040", borderRadius: "0.375rem", padding: "0.25rem 0.625rem", cursor: "pointer" }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.8125rem", color: "#9A958F" }}>No video — upload below</span>
                          )}
                          <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
                            <input
                              type="file"
                              accept="video/*"
                              style={{ fontSize: "0.8125rem", color: "#1C1B19" }}
                              onChange={e => {
                                const f = e.target.files?.[0] ?? null;
                                setProjectVideoFiles(prev => ({ ...prev, [project.id]: f }));
                              }}
                            />
                            <button
                              onClick={() => uploadProjectVideo(project.id)}
                              disabled={projectVideoUploading.has(project.id) || !projectVideoFiles[project.id]}
                              style={{
                                fontSize: "0.8125rem", fontWeight: 600, color: "#fff",
                                background: "#1F4B4A", border: "none", borderRadius: "0.375rem",
                                padding: "0.3rem 0.75rem", cursor: projectVideoUploading.has(project.id) || !projectVideoFiles[project.id] ? "not-allowed" : "pointer",
                                opacity: projectVideoUploading.has(project.id) || !projectVideoFiles[project.id] ? 0.55 : 1,
                              }}
                            >
                              {projectVideoUploading.has(project.id) ? "Uploading…" : "Upload"}
                            </button>
                          </div>
                          {projectVideoFiles[project.id] && projectVideoFiles[project.id]!.size > SIZE_VIDEO_WARN_MB * 1024 * 1024 && (
                            <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "#FBF4E4", border: "1px solid #F0D98A", borderRadius: "0.375rem", fontSize: "0.8125rem", color: "#A07020" }}>
                              File exceeds {SIZE_VIDEO_WARN_MB} MB — upload may be slow.
                            </div>
                          )}
                        </div>

                        {/* ── Import panel ── */}
                        {importingProjectId === project.id && (
                          <div style={{ borderTop: "1px solid #F0EDE8", padding: "1rem 1.375rem", background: "#FDFCFB" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#C89B3C", marginBottom: "0.875rem" }}>
                              Import unit types from Excel / CSV
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                              <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                style={{ fontSize: "0.8125rem", color: "#1C1B19" }}
                                onChange={e => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
                              />
                              <button
                                onClick={() => runImport(project.id)}
                                disabled={importBusy || !importFile}
                                style={{
                                  fontSize: "0.8125rem", fontWeight: 600, color: "#fff",
                                  background: "#1F4B4A", border: "none", borderRadius: "0.375rem",
                                  padding: "0.3rem 0.875rem", cursor: importBusy || !importFile ? "not-allowed" : "pointer",
                                  opacity: importBusy || !importFile ? 0.55 : 1,
                                }}
                              >
                                {importBusy ? "Importing…" : "Import"}
                              </button>
                              <button
                                onClick={cancelImport}
                                style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", background: "none", border: "1px solid #DDD9D3", borderRadius: "0.375rem", padding: "0.3rem 0.75rem", cursor: "pointer" }}
                              >
                                {importResult ? "Close" : "Cancel"}
                              </button>
                            </div>
                            {importResult && (
                              <div style={{ fontSize: "0.8125rem", color: "#1C1B19", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                <div style={{ color: "#1F4B4A" }}>✓ {importResult.created} unit type{importResult.created !== 1 ? "s" : ""} created</div>
                                {importResult.updated > 0 && (
                                  <div style={{ color: "#1F4B4A" }}>✓ {importResult.updated} unit type{importResult.updated !== 1 ? "s" : ""} updated</div>
                                )}
                                {importResult.skipped.length > 0 && (
                                  <div>
                                    <div style={{ color: "#A07020" }}>⚠ {importResult.skipped.length} row{importResult.skipped.length !== 1 ? "s" : ""} skipped:</div>
                                    {importResult.skipped.map((s, i) => (
                                      <div key={i} style={{ color: "#6B6860", paddingLeft: "0.875rem" }}>Row {s.row}: {s.reason}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Add unit type + import buttons */}
                        <div style={{ borderTop: "1px solid #F0EDE8", padding: "0.875rem 1.375rem", display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
                          {addingUnitTypeToProjectId !== project.id && (
                            <button
                              onClick={() => startAddUnitType(project.id)}
                              style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#1F4B4A", background: "none", border: "1px dashed #B8D4D3", borderRadius: "0.4rem", padding: "0.4rem 0.875rem", cursor: "pointer" }}
                            >
                              + Add unit type
                            </button>
                          )}
                          {importingProjectId !== project.id && (
                            <button
                              onClick={() => startImport(project.id)}
                              style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860", background: "none", border: "1px dashed #DDD9D3", borderRadius: "0.4rem", padding: "0.4rem 0.875rem", cursor: "pointer" }}
                            >
                              Import from Excel / CSV
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── RESERVATIONS ── */}
        {tab === "reservations" && (
          <div>
            <SectionHeading>Reservations</SectionHeading>
            {reservations.length === 0 && <p style={{ color: "#6B6860", textAlign: "center", padding: "3rem 0" }}>No reservations yet — buyers will appear here when they reserve your units at the listed price.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {reservations.map(reservation => {
                const isComplete = reservation.depositPaid && !!reservation.buyerSignature && !!reservation.developerSignature;
                const statusLabel = isComplete ? "Complete" : reservation.depositPaid ? "Awaiting signatures" : "Deposit pending";
                const statusBg = isComplete ? "#E8F0EF" : reservation.depositPaid ? "#FBF4E4" : "#FAE8E8";
                const statusColor = isComplete ? "#1F4B4A" : reservation.depositPaid ? "#C89B3C" : "#B04040";
                return (
                  <div key={reservation.id} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
                    <div style={{ padding: "1.25rem 1.375rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.0625rem", fontWeight: 700, color: "#1C1B19" }}>
                              {reservation.unitType.project.name} — {reservation.unitType.unitLabel}
                            </span>
                            <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", padding: "0.2rem 0.625rem", borderRadius: "999px", background: statusBg, color: statusColor }}>
                              {statusLabel}
                            </span>
                          </div>
                          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#6B6860" }}>
                            Buyer: <strong style={{ color: "#1C1B19" }}>{reservation.buyer.email}</strong>
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.6875rem", color: "#6B6860", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Reserved price</div>
                          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.5rem", fontWeight: 700, color: "#1F4B4A" }}>£{reservation.offeredPrice.toLocaleString()}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: "1rem" }}>
                        <Link
                          href={`/deal/${reservation.id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1.125rem", borderRadius: 999, background: "linear-gradient(155deg, #2F6664, #123332)", color: "#fff", fontSize: "0.8125rem", fontWeight: 700, textDecoration: "none" }}
                        >
                          View Deal Room →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* ── LEVERAGE GROUPS ── */}
        {tab === "groups" && (
          <div>
            <SectionHeading>Leverage Groups</SectionHeading>
            {groups.length === 0 && <p style={{ color: "#6B6860", textAlign: "center", padding: "3rem 0" }}>No group offers received yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {groups.map(group => {
                const canAct = group.status === "pending" || group.status === "countered";
                const listingLabel = `${group.unitType.project.name} — ${group.unitType.unitLabel}`;
                return (
                  <div key={group.id} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
                    <div style={{ padding: "1.25rem 1.375rem" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "#E8F0EF", borderRadius: "999px", padding: "0.2rem 0.625rem 0.2rem 0.375rem" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1F4B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                              </svg>
                              <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem", fontWeight: 700, color: "#1F4B4A" }}>{group.memberCount} buyers</span>
                            </div>
                            <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.0625rem", fontWeight: 700, color: "#1C1B19" }}>{listingLabel}</span>
                            <StatusBadge status={group.status} map={OFFER_STATUS} />
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "0.6875rem", color: "#6B6860", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>Requested discount</div>
                          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.5rem", fontWeight: 700, color: "#C89B3C" }}>{group.requestedDiscountPercent}%</div>
                        </div>
                      </div>

                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem", color: "#1C1B19", background: "#F7F5F1", borderRadius: "0.375rem", padding: "0.625rem 0.75rem", lineHeight: 1.55 }}>
                        {group.requestedTerms}
                      </p>

                      {group.counterDiscountPercent != null && (
                        <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#FBF4E4", borderRadius: "0.5rem", borderLeft: "3px solid #C89B3C" }}>
                          <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#C89B3C", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                            Your counter — {group.counterDiscountPercent}% discount
                          </div>
                          <p style={{ margin: 0, fontSize: "0.875rem", color: "#1C1B19" }}>{group.counterTerms}</p>
                        </div>
                      )}

                      {canAct && (
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                          <ActionButton onClick={() => respondGroup(group.id, "accept")} variant="primary">Accept</ActionButton>
                          <ActionButton onClick={() => respondGroup(group.id, "reject")} variant="danger">Reject</ActionButton>
                          <ActionButton
                            onClick={() => { setCounteringGroupId(counteringGroupId === group.id ? null : group.id); setGroupCounter({ counterDiscountPercent: "", counterTerms: "" }); }}
                            variant="ghost"
                          >
                            {counteringGroupId === group.id ? "Cancel counter" : "Counter"}
                          </ActionButton>
                        </div>
                      )}
                    </div>

                    {counteringGroupId === group.id && (
                      <div style={{ borderTop: "1px solid #F0EDE8", padding: "1.125rem 1.375rem", background: "#FDFCFB", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#C89B3C" }}>Counter offer</div>
                        <div className="hn-dev-counter-grid" style={{ display: "grid", gridTemplateColumns: "10rem 1fr", gap: "0.75rem" }}>
                          <FormField label="Counter discount %">
                            <input type="number" step="0.5" value={groupCounter.counterDiscountPercent} onChange={e => setGroupCounter(f => ({ ...f, counterDiscountPercent: e.target.value }))}
                              style={{ ...inputStyle, fontFamily: "var(--font-jetbrains, monospace)" }} />
                          </FormField>
                          <FormField label="Counter terms">
                            <input value={groupCounter.counterTerms} onChange={e => setGroupCounter(f => ({ ...f, counterTerms: e.target.value }))}
                              placeholder="State your counter terms…" style={inputStyle} />
                          </FormField>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <ActionButton onClick={() => respondGroup(group.id, "counter")} variant="primary">Send counter</ActionButton>
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
          <input type="number" style={inputStyle} value={form.quantityTotal} onChange={f("quantityTotal")} placeholder="12" />
        </FormField>
        <FormField label="Available quantity">
          <input type="number" style={inputStyle} value={form.quantityAvailable} onChange={f("quantityAvailable")} placeholder="12" />
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
        <ActionButton onClick={onSubmit} variant="primary">{isEdit ? "Save changes" : "Add unit type"}</ActionButton>
      </div>
    </div>
  );
}
