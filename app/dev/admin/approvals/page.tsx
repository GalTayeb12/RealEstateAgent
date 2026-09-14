"use client";
/**
 * /dev/admin/approvals — Admin panel.
 *
 * Auth gate (client-side, before any data is fetched or rendered):
 *   - No token           → redirect to /login
 *   - Token, role=buyer  → redirect to /results
 *   - Token, role=dev    → redirect to /dev/dashboard
 *   - Token, role=admin  → render page
 *
 * The API routes enforce the same rules server-side — this client check
 * is purely for UX (fast redirect, no flash of admin content).
 *
 * Tabs:
 *   1. Overview  — stats cards + user table with search/filter
 *   2. Developer approvals — approve/reject flow
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WebResearch {
  summary: string;
  foundOnlinePresence: boolean;
  flagsOrConcerns: string[];
}

interface RegistryResult {
  found: boolean;
  registeredName: string | null;
  registeredNameEn: string | null;
  status: string | null;
  incorporationDate: string | null;
  entityType: string | null;
  nameMismatch: boolean;
  statusFlag: boolean;
  flags: string[];
}

interface DevProfile {
  id: string;
  companyName: string;
  crn: string;
  contactName: string;
  phone: string;
  crnStatus: string;
  qualityScore: number;
  baselineScore: number;
  webResearchSummary: string;
  registryLookupResult: string;
  createdAt: string;
  user: { id: string; email: string; createdAt: string };
}

interface Stats {
  totalUsers: number;
  buyers: number;
  developers: number;
  totalOffers: number;
  pendingOffers: number;
  activeGroups: number;
  activeUnits: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  developerProfile: { companyName: string; crnStatus: string; qualityScore: number } | null;
}

interface AdminLeverageGroup {
  id: string;
  memberCount: number;
  status: string;
  createdAt: string;
  unitType: {
    unitLabel: string;
    price: number;
    project: { name: string; location: string };
  };
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { background: string; color: string; label: string }> = {
  pending:  { background: "#FBF4E4", color: "#C89B3C", label: "Pending review" },
  approved: { background: "#E8F0EF", color: "#1F4B4A", label: "Approved" },
  rejected: { background: "#FAE8E8", color: "#B04040", label: "Rejected" },
};

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  buyer:     { bg: "#E8F0EF", color: "#1F4B4A" },
  developer: { bg: "#FBF4E4", color: "#C89B3C" },
  admin:     { bg: "#FAE8E8", color: "#B04040" },
};

// ── Stats cards ────────────────────────────────────────────────────────────────

function StatsCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Total users",     value: stats.totalUsers,    sub: `${stats.buyers} buyers · ${stats.developers} devs` },
    { label: "Total offers",    value: stats.totalOffers,   sub: `${stats.pendingOffers} pending` },
    { label: "Active groups",   value: stats.activeGroups,  sub: "Leverage group requests" },
    { label: "Active listings", value: stats.activeUnits,   sub: "Unit types live" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))", gap: "0.875rem" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", padding: "1.25rem 1.375rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860", marginBottom: "0.375rem" }}>{c.label}</div>
          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.75rem", fontWeight: 700, color: "#1C1B19", lineHeight: 1 }}>{c.value}</div>
          <div style={{ fontSize: "0.75rem", color: "#9A958F", marginTop: "0.375rem" }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── User table ─────────────────────────────────────────────────────────────────

function UserTable({ token }: { token: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    try {
      const res = await fetch(`/api/dev/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [token, q, role, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, role]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
      {/* Filters */}
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #F0EDE8", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#1C1B19", marginRight: "auto" }}>
          Users <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem", color: "#9A958F", fontWeight: 400 }}>({total})</span>
        </div>
        <input
          type="text"
          placeholder="Search by email…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ padding: "0.4375rem 0.75rem", border: "1px solid #DDD9D3", borderRadius: "0.375rem", fontSize: "0.875rem", outline: "none", minWidth: "13rem" }}
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ padding: "0.4375rem 0.75rem", border: "1px solid #DDD9D3", borderRadius: "0.375rem", fontSize: "0.875rem", outline: "none", fontFamily: "inherit" }}
        >
          <option value="">All roles</option>
          <option value="buyer">Buyers</option>
          <option value="developer">Developers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6B6860" }}>Loading…</div>
      ) : users.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6B6860" }}>No users found.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #F0EDE8" }}>
                {["Email", "Role", "Company", "Registered"].map(h => (
                  <th key={h} style={{ padding: "0.625rem 1.25rem", textAlign: "left", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const roleStyle = ROLE_STYLE[u.role] ?? ROLE_STYLE.buyer;
                return (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid #F7F5F1" : "none" }}>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#1C1B19", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>
                      {u.email}
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem", borderRadius: 999, background: roleStyle.bg, color: roleStyle.color }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#6B6860" }}>
                      {u.developerProfile ? (
                        <div>
                          <div style={{ color: "#1C1B19", fontWeight: 500 }}>{u.developerProfile.companyName}</div>
                          <div style={{ fontSize: "0.75rem", color: "#9A958F" }}>
                            {STATUS_STYLE[u.developerProfile.crnStatus]?.label ?? u.developerProfile.crnStatus}
                            {" · "}Score {u.developerProfile.qualityScore}
                          </div>
                        </div>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#9A958F", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                      {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: "0.875rem 1.5rem", borderTop: "1px solid #F0EDE8", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8125rem", color: "#6B6860" }}>
          <span>Page {page} of {totalPages}</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "0.3rem 0.75rem", border: "1px solid #DDD9D3", borderRadius: "0.375rem", background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: "0.8125rem" }}>← Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "0.3rem 0.75rem", border: "1px solid #DDD9D3", borderRadius: "0.375rem", background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, fontSize: "0.8125rem" }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Research + Registry sections (unchanged from before) ───────────────────────

function parseResearch(raw: string): WebResearch | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as WebResearch; } catch { return null; }
}

function ResearchSection({ profileId, raw, token, onRefreshed }: { profileId: string; raw: string; token: string; onRefreshed: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const research = parseResearch(raw);

  async function triggerResearch() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/dev/admin/research/${profileId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.webResearchSummary !== undefined) onRefreshed(data.webResearchSummary);
    } catch { /* ignore */ } finally { setRefreshing(false); }
  }

  const isUnavailable = !research || research.summary === "Research unavailable" || research.summary.startsWith("Research failed") || research.summary.startsWith("Research unavailable");
  const isPending = !raw;
  const hasConcerns = research && research.flagsOrConcerns.length > 0;

  return (
    <div style={{ borderTop: "1px solid #F0EDE8", marginTop: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setOpen(v => !v)} style={{ textAlign: "left", padding: "0.625rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
          <span style={{ fontSize: "0.75rem", color: "#6B6860", transition: "transform 0.15s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860" }}>AI web research (supporting info)</span>
          {hasConcerns && <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 999, background: "#FAE8E8", color: "#B04040", marginLeft: "0.25rem" }}>{research!.flagsOrConcerns.length} flag{research!.flagsOrConcerns.length > 1 ? "s" : ""}</span>}
          {research && !isUnavailable && research.foundOnlinePresence && !hasConcerns && <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 999, background: "#E8F0EF", color: "#1F4B4A", marginLeft: "0.25rem" }}>Online presence found</span>}
        </button>
        {(isPending || isUnavailable) && (
          <button onClick={triggerResearch} disabled={refreshing} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid #DDD9D3", background: "#fff", color: "#6B6860", cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.6 : 1, flexShrink: 0 }}>
            {refreshing ? "Running (~60s)…" : "Run research"}
          </button>
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: "0.875rem" }}>
          <div style={{ background: "#F7F5F1", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#6B6860", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.375rem" }}>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>AI research — not verified.</span>
            <span>Auxiliary signal only. Do not treat as ground truth.</span>
          </div>
          {isPending && <p style={{ fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>Research in progress — check back in a moment.</p>}
          {!isPending && isUnavailable && <p style={{ fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>{research?.summary ?? "Research unavailable."}</p>}
          {!isPending && !isUnavailable && research && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6860" }}>Online presence</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: research.foundOnlinePresence ? "#E8F0EF" : "#FAE8E8", color: research.foundOnlinePresence ? "#1F4B4A" : "#B04040" }}>
                  {research.foundOnlinePresence ? "Found" : "Not found"}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "#1C1B19", lineHeight: 1.6, whiteSpace: "pre-line" }}>{research.summary}</div>
              {hasConcerns && (
                <div style={{ background: "#FAE8E8", borderRadius: "0.5rem", padding: "0.625rem 0.875rem" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#B04040", marginBottom: "0.375rem" }}>Flags / concerns</div>
                  <ul style={{ margin: 0, padding: "0 0 0 1.125rem", fontSize: "0.875rem", color: "#B04040" }}>
                    {research.flagsOrConcerns.map((flag, i) => <li key={i}>{flag}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseRegistry(raw: string): RegistryResult | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as RegistryResult; } catch { return null; }
}

function RegistrySection({ profileId, raw, token, onRefreshed }: { profileId: string; raw: string; token: string; onRefreshed: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const result = parseRegistry(raw);

  async function triggerLookup() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/dev/admin/registry/${profileId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.registryLookupResult !== undefined) onRefreshed(data.registryLookupResult);
    } catch { /* ignore */ } finally { setRefreshing(false); }
  }

  const isPending = !raw;
  const isUnavailable = !result || (result.flags.length === 1 && result.flags[0] === "Registry lookup unavailable");
  const hasFlags = result && result.flags.length > 0;
  const hasHardFlag = result && (result.nameMismatch || result.statusFlag || !result.found);

  return (
    <div style={{ borderTop: "1px solid #F0EDE8", marginTop: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setOpen(v => !v)} style={{ textAlign: "left", padding: "0.625rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
          <span style={{ fontSize: "0.75rem", color: "#6B6860", transition: "transform 0.15s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#6B6860" }}>Companies registry lookup</span>
          {hasHardFlag && <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 999, background: "#FAE8E8", color: "#B04040", marginLeft: "0.25rem" }}>{result!.flags.length} flag{result!.flags.length > 1 ? "s" : ""}</span>}
          {result && result.found && !hasHardFlag && <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 999, background: "#E8F0EF", color: "#1F4B4A", marginLeft: "0.25rem" }}>Active &amp; matched</span>}
        </button>
        {(isPending || isUnavailable) && (
          <button onClick={triggerLookup} disabled={refreshing} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid #DDD9D3", background: "#fff", color: "#6B6860", cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.6 : 1, flexShrink: 0 }}>
            {refreshing ? "Looking up…" : "Run lookup"}
          </button>
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: "0.875rem" }}>
          <div style={{ background: "#F7F5F1", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#6B6860", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.375rem" }}>
            <span style={{ fontWeight: 700, flexShrink: 0 }}>Unofficial — best-effort.</span>
            <span>Data from data.gov.il (Ministry of Justice, updated daily). May lag real-world changes.</span>
          </div>
          {isPending && <p style={{ fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>Registry lookup not yet run.</p>}
          {!isPending && isUnavailable && <p style={{ fontSize: "0.875rem", color: "#6B6860", margin: 0 }}>Registry lookup unavailable — could not reach data.gov.il.</p>}
          {!isPending && !isUnavailable && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6860" }}>Found in registry</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: result.found ? "#E8F0EF" : "#FAE8E8", color: result.found ? "#1F4B4A" : "#B04040" }}>{result.found ? "Yes" : "No"}</span>
                {result.found && result.status && (
                  <>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6B6860" }}>Status</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: result.statusFlag ? "#FAE8E8" : "#E8F0EF", color: result.statusFlag ? "#B04040" : "#1F4B4A" }}>{result.status}</span>
                  </>
                )}
              </div>
              {result.found && (
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                  {([["Registered name", result.registeredName ?? "—"], result.registeredNameEn ? ["English name", result.registeredNameEn] : null, ["Entity type", result.entityType ?? "—"], ["Incorporated", result.incorporationDate ?? "—"]] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                    <div key={label as string}>
                      <div style={{ fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                      <div style={{ fontSize: "0.875rem", color: "#1C1B19" }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
              {hasFlags && (
                <div style={{ background: "#FAE8E8", borderRadius: "0.5rem", padding: "0.625rem 0.875rem" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#B04040", marginBottom: "0.375rem" }}>Flags / concerns</div>
                  <ul style={{ margin: 0, padding: "0 0 0 1.125rem", fontSize: "0.875rem", color: "#B04040" }}>
                    {result.flags.map((flag, i) => <li key={i}>{flag}</li>)}
                  </ul>
                </div>
              )}
              {!hasFlags && result.found && <p style={{ fontSize: "0.8125rem", color: "#1F4B4A", margin: 0 }}>No issues found — CRN matches an active company with consistent name.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Developer approvals tab ────────────────────────────────────────────────────

function ApprovalsTab({ token }: { token: string }) {
  const [profiles, setProfiles] = useState<DevProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/dev/admin/approvals", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403 || res.status === 401) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setProfiles(data.profiles ?? []);
    setLoading(false);
  }

  useEffect(() => { if (token) load(); }, [token]);

  function updateResearch(profileId: string, newRaw: string) {
    setProfiles(ps => ps.map(p => p.id === profileId ? { ...p, webResearchSummary: newRaw } : p));
  }
  function updateRegistry(profileId: string, newRaw: string) {
    setProfiles(ps => ps.map(p => p.id === profileId ? { ...p, registryLookupResult: newRaw } : p));
  }

  async function respond(profileId: string, action: "approve" | "reject") {
    setBusy(profileId + action);
    await fetch(`/api/dev/admin/approve/${profileId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setBusy(null);
  }

  if (forbidden) {
    return (
      <div style={{ background: "#FAE8E8", borderRadius: "0.875rem", border: "1px solid #E8BDBD", padding: "1.5rem", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 700, color: "#B04040", marginBottom: "0.375rem" }}>Access denied</div>
        <p style={{ margin: 0, fontSize: "0.9375rem", color: "#B04040" }}>This page requires an admin account.</p>
      </div>
    );
  }
  if (loading) return <p style={{ color: "#6B6860" }}>Loading…</p>;
  if (profiles.length === 0) return <p style={{ color: "#6B6860" }}>No developer accounts found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {profiles.map(p => {
        const st = STATUS_STYLE[p.crnStatus] ?? STATUS_STYLE.pending;
        return (
          <div key={p.id} style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
            <div style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 700, color: "#1C1B19" }}>{p.companyName}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.625rem", borderRadius: 999, background: st.background, color: st.color }}>{st.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                    {[["CRN", p.crn], ["Contact", p.contactName], ["Phone", p.phone], ["Email", p.user.email]].map(([label, value]) => (
                      <div key={label}>
                        <span style={{ fontSize: "0.6875rem", color: "#6B6860", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label} </span>
                        <span style={{ fontSize: "0.875rem", color: "#1C1B19", fontFamily: label === "CRN" ? "var(--font-jetbrains, monospace)" : undefined }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#6B6860", marginTop: "0.125rem" }}>
                    Registered {new Date(p.user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}Baseline score <strong>{Math.round(p.baselineScore)}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.625rem", flexShrink: 0 }}>
                  <button
                    onClick={() => respond(p.id, "approve")}
                    disabled={p.crnStatus === "approved" || !!busy}
                    style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "1px solid #1F4B4A", background: p.crnStatus === "approved" ? "#E8F0EF" : "#1F4B4A", color: p.crnStatus === "approved" ? "#1F4B4A" : "#fff", fontSize: "0.875rem", fontWeight: 600, cursor: p.crnStatus === "approved" ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                  >
                    {busy === p.id + "approve" ? "…" : p.crnStatus === "approved" ? "Approved" : "Approve"}
                  </button>
                  <button
                    onClick={() => respond(p.id, "reject")}
                    disabled={p.crnStatus === "rejected" || !!busy}
                    style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "1px solid #DDD9D3", background: p.crnStatus === "rejected" ? "#FAE8E8" : "#fff", color: p.crnStatus === "rejected" ? "#B04040" : "#6B6860", fontSize: "0.875rem", fontWeight: 600, cursor: p.crnStatus === "rejected" ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                  >
                    {busy === p.id + "reject" ? "…" : p.crnStatus === "rejected" ? "Rejected" : "Reject"}
                  </button>
                </div>
              </div>

              <ResearchSection profileId={p.id} raw={p.webResearchSummary} token={token} onRefreshed={r => updateResearch(p.id, r)} />
              <RegistrySection profileId={p.id} raw={p.registryLookupResult} token={token} onRefreshed={r => updateRegistry(p.id, r)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Leverage groups table ─────────────────────────────────────────────────────

const GROUP_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: "Open",      bg: "#E8F0EF", color: "#1F4B4A" },
  countered: { label: "Countered", bg: "#FBF4E4", color: "#C89B3C" },
  accepted:  { label: "Accepted",  bg: "#E8F0EF", color: "#1F4B4A" },
  rejected:  { label: "Closed",    bg: "#FAE8E8", color: "#B04040" },
};

function LeverageGroupsTable({ token }: { token: string }) {
  const [groups, setGroups] = useState<AdminLeverageGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/dev/admin/leverage-groups", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setGroups(d.groups ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const openGroups = groups.filter(g => g.status === "pending" || g.status === "countered");

  return (
    <div style={{ background: "#fff", borderRadius: "0.875rem", border: "1px solid #DDD9D3", overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #F0EDE8", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#1C1B19" }}>
          Group buying interest
        </div>
        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem", color: "#9A958F" }}>
          ({openGroups.length} open)
        </span>
        <div style={{ marginLeft: "auto", fontSize: "0.8125rem", color: "#6B6860" }}>
          Approach the developer when a group has enough members
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6B6860" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#6B6860" }}>No group requests yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #F0EDE8" }}>
                {["Listing", "Members", "Status", "Created"].map(h => (
                  <th key={h} style={{ padding: "0.625rem 1.25rem", textAlign: "left", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#6B6860", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => {
                const st = GROUP_STATUS[g.status] ?? GROUP_STATUS.pending;
                const isHighlight = g.memberCount >= 3 && g.status === "pending";
                return (
                  <tr key={g.id} style={{ borderBottom: i < groups.length - 1 ? "1px solid #F7F5F1" : "none", background: isHighlight ? "rgba(31,75,74,0.03)" : "transparent" }}>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <div style={{ fontWeight: 500, color: "#1C1B19" }}>
                        {g.unitType.project.name} — {g.unitType.unitLabel}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#9A958F" }}>
                        {g.unitType.project.location}
                        {g.unitType.price > 0 && ` · £${g.unitType.price.toLocaleString()}`}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isHighlight ? "#1F4B4A" : "#6B6860"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 700, color: isHighlight ? "#1F4B4A" : "#1C1B19", fontSize: "0.9375rem" }}>
                          {g.memberCount}
                        </span>
                        {isHighlight && (
                          <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: "0.1rem 0.5rem", borderRadius: 999, background: "#E8F0EF", color: "#1F4B4A" }}>
                            Ready to approach
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem", borderRadius: 999, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "#9A958F", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                      {new Date(g.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ token }: { token: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/dev/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <p style={{ color: "#6B6860" }}>Loading…</p>;
  if (!stats) return <p style={{ color: "#B04040" }}>Failed to load stats — make sure you&apos;re logged in as admin.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <StatsCards stats={stats} />
      <LeverageGroupsTable token={token} />
      <UserTable token={token} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

/** Decode JWT payload without verifying signature — used only for client-side UX redirect.
 *  Real security is enforced by the API routes via requireAdmin(). */
function decodeJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export default function AdminApprovalsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [authStatus, setAuthStatus] = useState<"checking" | "ok">("checking");
  const [tab, setTab] = useState<"overview" | "approvals">("overview");

  useEffect(() => {
    const t = localStorage.getItem("token") ?? "";

    if (!t) {
      router.push("/login");
      return;
    }

    const role = decodeJwtRole(t);

    if (!role) {
      // Malformed token — treat as unauthenticated
      router.push("/login");
      return;
    }

    if (role === "admin") {
      setToken(t);
      setAuthStatus("ok");
      return;
    }

    // Valid token but wrong role — redirect to the right place
    if (role === "developer") {
      router.push("/dev/dashboard");
    } else {
      // buyer or anything else
      router.push("/results");
    }
  }, [router]);

  // Render nothing until auth is confirmed — prevents any flash of admin content
  if (authStatus === "checking") {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F5F1", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(28,27,25,0.08)", borderTopColor: "#1F4B4A", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 1.125rem",
    borderRadius: "0.5rem",
    border: "none",
    background: active ? "#1F4B4A" : "transparent",
    color: active ? "#fff" : "#6B6860",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <main style={{ minHeight: "100vh", background: "#F7F5F1", fontFamily: "var(--font-inter, sans-serif)" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #DDD9D3" }}>
        <div style={{ maxWidth: "62rem", margin: "0 auto", padding: "1.5rem" }}>
          <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1F4B4A", marginBottom: "0.5rem" }}>
            Haveniq — Admin
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 700, color: "#1C1B19", margin: 0 }}>
                Admin dashboard
              </h1>
              <p style={{ margin: "0.375rem 0 0", color: "#6B6860", fontSize: "0.9375rem" }}>
                Admin only — requires role: admin.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.375rem", background: "#F0EDE8", borderRadius: "0.625rem", padding: "0.25rem" }}>
              <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>Overview</button>
              <button style={tabStyle(tab === "approvals")} onClick={() => setTab("approvals")}>Developer approvals</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "62rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {tab === "overview" && <OverviewTab token={token} />}
        {tab === "approvals" && <ApprovalsTab token={token} />}
      </div>
    </main>
  );
}
