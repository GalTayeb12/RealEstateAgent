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
import { useI18n } from "@/components/LocaleProvider";
import { currentRole } from "@/lib/clientSession";

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

// Copy (he/en) lives in lib/i18n/messages.ts under `admin`. Server-generated text (AI research summaries, registry
// flags) is passed through as written.
function useT() {
  return useI18n().m.admin;
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  pending:  { background: "var(--c-warn-bg,#FCF2D9)", color: "var(--c-gold,#756039)" },
  approved: { background: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)" },
  rejected: { background: "var(--c-err-bg,#FBECEA)", color: "var(--c-err,#9E3434)" },
};

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  buyer:     { bg: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)" },
  developer: { bg: "var(--c-warn-bg,#FCF2D9)", color: "var(--c-gold,#756039)" },
  admin:     { bg: "var(--c-err-bg,#FBECEA)", color: "var(--c-err,#9E3434)" },
};

// ── Stats cards ────────────────────────────────────────────────────────────────

function StatsCards({ stats }: { stats: Stats }) {
  const L = useT();
  const cards = [
    { label: L.totalUsers,     value: stats.totalUsers,    sub: L.usersSub(stats.buyers, stats.developers) },
    { label: L.totalOffers,    value: stats.totalOffers,   sub: L.pendingN(stats.pendingOffers) },
    { label: L.activeGroups,   value: stats.activeGroups,  sub: L.groupReqs },
    { label: L.activeListings, value: stats.activeUnits,   sub: L.unitTypesLive },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))", gap: "0.875rem" }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: "var(--c-card,#fff)", borderRadius: "0.875rem", border: "1px solid var(--c-line,#D4DED8)", padding: "1.25rem 1.375rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#526563)", marginBottom: "0.375rem" }}>{c.label}</div>
          <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.75rem", fontWeight: 600, color: "var(--c-ink,#123F40)", lineHeight: 1 }}>{c.value}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)", marginTop: "0.375rem" }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ── User table ─────────────────────────────────────────────────────────────────

function UserTable({ token }: { token: string }) {
  const { m } = useI18n();
  const L = useT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetNote, setResetNote] = useState("");
  const limit = 25;

  async function resetQuota(user: AdminUser) {
    const ok = window.confirm(`${m.admin.resetQuotaConfirm} ${user.email}?`);
    if (!ok) return;
    setResettingId(user.id);
    setResetNote("");
    try {
      const res = await fetch(`/api/dev/admin/users/${user.id}/reset-interview-quota`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setResetNote(`${m.admin.resetQuotaDone}: ${user.email}`);
    } catch (err) {
      setResetNote((err as Error).message);
    } finally {
      setResettingId(null);
    }
  }

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

  useEffect(() => {
    const startId = setTimeout(load, 0);
    return () => clearTimeout(startId);
  }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ background: "var(--c-card,#fff)", borderRadius: "0.875rem", border: "1px solid var(--c-line,#D4DED8)", overflow: "hidden" }}>
      {/* Filters */}
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--c-line,#E9EEEA)", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-ink,#123F40)", marginInlineEnd: "auto" }}>
          {L.users} <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem", color: "var(--c-muted,#526563)", fontWeight: 400 }}>({total})</span>
        </div>
        {resetNote && (
          <div style={{ fontSize: "0.8125rem", color: "var(--c-ink,#123F40)", fontWeight: 600 }}>{resetNote}</div>
        )}
        <input
          type="text"
          placeholder={L.searchEmail}
          aria-label={L.searchEmail}
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ padding: "0.4375rem 0.75rem", border: "1px solid var(--c-line,#D4DED8)", borderRadius: "0.375rem", fontSize: "0.875rem", outline: "none", minWidth: "13rem" }}
        />
        <select
          aria-label={L.allRoles}
          value={role}
          onChange={e => { setRole(e.target.value); setPage(1); }}
          style={{ padding: "0.4375rem 0.75rem", border: "1px solid var(--c-line,#D4DED8)", borderRadius: "0.375rem", fontSize: "0.875rem", outline: "none", fontFamily: "inherit" }}
        >
          <option value="">{L.allRoles}</option>
          <option value="buyer">{L.buyers}</option>
          <option value="developer">{L.developers}</option>
          <option value="admin">{L.admins}</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--c-muted,#526563)" }}>{L.loading}</div>
      ) : users.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--c-muted,#526563)" }}>{L.noUsers}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--c-line,#E9EEEA)" }}>
                {[L.thEmail, L.thRole, L.thCompany, L.thRegistered, ""].map((h, hi) => (
                  <th key={hi} style={{ padding: "0.625rem 1.25rem", textAlign: "start", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#526563)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const roleStyle = ROLE_STYLE[u.role] ?? ROLE_STYLE.buyer;
                return (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? "1px solid var(--c-line,#F4F5F0)" : "none" }}>
                    <td style={{ padding: "0.75rem 1.25rem", color: "var(--c-ink,#123F40)", fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.8125rem" }}>
                      {u.email}
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem", borderRadius: 999, background: roleStyle.bg, color: roleStyle.color }}>
                        {L.role[u.role] ?? u.role}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "var(--c-muted,#526563)" }}>
                      {u.developerProfile ? (
                        <div>
                          <div style={{ color: "var(--c-ink,#123F40)", fontWeight: 500 }}>{u.developerProfile.companyName}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)" }}>
                            {L.status[u.developerProfile.crnStatus] ?? u.developerProfile.crnStatus}
                            {" · "}{L.score} {u.developerProfile.qualityScore}
                          </div>
                        </div>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "var(--c-muted,#526563)", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                      {new Date(u.createdAt).toLocaleDateString(L.dateLocale, { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", whiteSpace: "nowrap" }}>
                      {u.role === "buyer" && (
                        <button
                          type="button"
                          disabled={resettingId === u.id}
                          onClick={() => { void resetQuota(u); }}
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.35rem 0.7rem",
                            borderRadius: 999,
                            border: "1px solid var(--c-ink,#123F40)",
                            background: "var(--c-card,#fff)",
                            color: "var(--c-ink,#123F40)",
                            cursor: resettingId === u.id ? "wait" : "pointer",
                          }}
                        >
                          {m.admin.resetQuota}
                        </button>
                      )}
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
        <div style={{ padding: "0.875rem 1.5rem", borderTop: "1px solid var(--c-line,#E9EEEA)", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--c-muted,#526563)" }}>
          <span>{L.page(page, totalPages)}</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "0.3rem 0.75rem", border: "1px solid var(--c-line,#D4DED8)", borderRadius: "0.375rem", background: "var(--c-card,#fff)", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: "0.8125rem" }}>{L.prev}</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "0.3rem 0.75rem", border: "1px solid var(--c-line,#D4DED8)", borderRadius: "0.375rem", background: "var(--c-card,#fff)", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, fontSize: "0.8125rem" }}>{L.next}</button>
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
  const L = useT();
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
    <div style={{ borderTop: "1px solid var(--c-line,#E9EEEA)", marginTop: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setOpen(v => !v)} style={{ textAlign: "start", padding: "0.625rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)", transition: "transform 0.15s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-muted,#526563)" }}>{L.aiResearch}</span>
          {hasConcerns && <span style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: "var(--c-err-bg,#FBECEA)", color: "var(--c-err,#9E3434)", marginInlineStart: "0.25rem" }}>{L.flagsN(research!.flagsOrConcerns.length)}</span>}
          {research && !isUnavailable && research.foundOnlinePresence && !hasConcerns && <span style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)", marginInlineStart: "0.25rem" }}>{L.onlineFound}</span>}
        </button>
        {(isPending || isUnavailable) && (
          <button onClick={triggerResearch} disabled={refreshing} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--c-line,#D4DED8)", background: "var(--c-card,#fff)", color: "var(--c-muted,#526563)", cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.6 : 1, flexShrink: 0 }}>
            {refreshing ? L.running : L.runResearch}
          </button>
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: "0.875rem" }}>
          <div style={{ background: "var(--c-soft,#F4F5F0)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--c-muted,#526563)", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.375rem" }}>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{L.aiNote1}</span>
            <span>{L.aiNote2}</span>
          </div>
          {isPending && <p style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)", margin: 0 }}>{L.inProgress}</p>}
          {!isPending && isUnavailable && <p style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)", margin: 0 }}>{research?.summary ?? L.researchUnavailable}</p>}
          {!isPending && !isUnavailable && research && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-muted,#526563)" }}>{L.onlinePresence}</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: research.foundOnlinePresence ? "var(--c-soft,#E9EEEA)" : "var(--c-err-bg,#FBECEA)", color: research.foundOnlinePresence ? "var(--c-ink,#123F40)" : "var(--c-err,#9E3434)" }}>
                  {research.foundOnlinePresence ? L.found : L.notFound}
                </span>
              </div>
              <div style={{ fontSize: "0.875rem", color: "var(--c-ink,#123F40)", lineHeight: 1.6, whiteSpace: "pre-line" }}>{research.summary}</div>
              {hasConcerns && (
                <div style={{ background: "var(--c-err-bg,#FBECEA)", borderRadius: "0.5rem", padding: "0.625rem 0.875rem" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-err,#9E3434)", marginBottom: "0.375rem" }}>{L.flagsConcerns}</div>
                  <ul style={{ margin: 0, paddingInlineStart: "1.125rem", paddingBlock: 0, fontSize: "0.875rem", color: "var(--c-err,#9E3434)" }}>
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
  const L = useT();
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
    <div style={{ borderTop: "1px solid var(--c-line,#E9EEEA)", marginTop: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setOpen(v => !v)} style={{ textAlign: "start", padding: "0.625rem 0", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)", transition: "transform 0.15s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--c-muted,#526563)" }}>{L.registryLookup}</span>
          {hasHardFlag && <span style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: "var(--c-err-bg,#FBECEA)", color: "var(--c-err,#9E3434)", marginInlineStart: "0.25rem" }}>{L.flagsN(result!.flags.length)}</span>}
          {result && result.found && !hasHardFlag && <span style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)", marginInlineStart: "0.25rem" }}>{L.activeMatched}</span>}
        </button>
        {(isPending || isUnavailable) && (
          <button onClick={triggerLookup} disabled={refreshing} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.25rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--c-line,#D4DED8)", background: "var(--c-card,#fff)", color: "var(--c-muted,#526563)", cursor: refreshing ? "not-allowed" : "pointer", opacity: refreshing ? 0.6 : 1, flexShrink: 0 }}>
            {refreshing ? L.lookingUp : L.runLookup}
          </button>
        )}
      </div>
      {open && (
        <div style={{ paddingBottom: "0.875rem" }}>
          <div style={{ background: "var(--c-soft,#F4F5F0)", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--c-muted,#526563)", marginBottom: "0.75rem", display: "flex", alignItems: "flex-start", gap: "0.375rem" }}>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{L.unofficial}</span>
            <span>{L.regSource}</span>
          </div>
          {isPending && <p style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)", margin: 0 }}>{L.notRun}</p>}
          {!isPending && isUnavailable && <p style={{ fontSize: "0.875rem", color: "var(--c-muted,#526563)", margin: 0 }}>{L.regUnavail}</p>}
          {!isPending && !isUnavailable && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-muted,#526563)" }}>{L.foundInRegistry}</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: result.found ? "var(--c-soft,#E9EEEA)" : "var(--c-err-bg,#FBECEA)", color: result.found ? "var(--c-ink,#123F40)" : "var(--c-err,#9E3434)" }}>{result.found ? L.yes : L.no}</span>
                {result.found && result.status && (
                  <>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-muted,#526563)" }}>{L.statusL}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: result.statusFlag ? "var(--c-err-bg,#FBECEA)" : "var(--c-soft,#E9EEEA)", color: result.statusFlag ? "var(--c-err,#9E3434)" : "var(--c-ink,#123F40)" }}>{result.status}</span>
                  </>
                )}
              </div>
              {result.found && (
                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                  {([[L.registeredName, result.registeredName ?? "—"], result.registeredNameEn ? [L.englishName, result.registeredNameEn] : null, [L.entityType, result.entityType ?? "—"], [L.incorporated, result.incorporationDate ?? "—"]] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                    <div key={label as string}>
                      <div style={{ fontSize: "0.6875rem", color: "var(--c-muted,#526563)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                      <div style={{ fontSize: "0.875rem", color: "var(--c-ink,#123F40)" }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
              {hasFlags && (
                <div style={{ background: "var(--c-err-bg,#FBECEA)", borderRadius: "0.5rem", padding: "0.625rem 0.875rem" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-err,#9E3434)", marginBottom: "0.375rem" }}>{L.flagsConcerns}</div>
                  <ul style={{ margin: 0, paddingInlineStart: "1.125rem", paddingBlock: 0, fontSize: "0.875rem", color: "var(--c-err,#9E3434)" }}>
                    {result.flags.map((flag, i) => <li key={i}>{flag}</li>)}
                  </ul>
                </div>
              )}
              {!hasFlags && result.found && <p style={{ fontSize: "0.8125rem", color: "var(--c-ink,#123F40)", margin: 0 }}>{L.noIssues}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Developer approvals tab ────────────────────────────────────────────────────

function ApprovalsTab({ token }: { token: string }) {
  const L = useT();
  const [profiles, setProfiles] = useState<DevProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/dev/admin/approvals", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 403 || res.status === 401) { setForbidden(true); setLoading(false); return; }
    const data = await res.json();
    setProfiles(data.profiles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!token) return;
    const startId = setTimeout(load, 0);
    return () => clearTimeout(startId);
  }, [token]);

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
      <div style={{ background: "var(--c-err-bg,#FBECEA)", borderRadius: "0.875rem", border: "1px solid var(--c-line,#E8BDBD)", padding: "1.5rem", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 600, color: "var(--c-err,#9E3434)", marginBottom: "0.375rem" }}>{L.accessDenied}</div>
        <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--c-err,#9E3434)" }}>{L.needAdmin}</p>
      </div>
    );
  }
  if (loading) return <p style={{ color: "var(--c-muted,#526563)" }}>{L.loading}</p>;
  if (profiles.length === 0) return <p style={{ color: "var(--c-muted,#526563)" }}>{L.noDevs}</p>;

  // Queue view: per-status counts (from the real profiles) + a filter, pending first.
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const p of profiles) {
    if (p.crnStatus === "approved") counts.approved++;
    else if (p.crnStatus === "rejected") counts.rejected++;
    else counts.pending++;
  }
  const shown = (filter === "all" ? profiles : profiles.filter(p => (p.crnStatus === "approved" || p.crnStatus === "rejected" ? p.crnStatus : "pending") === filter))
    .slice().sort((a, b) => Number(b.crnStatus === "pending") - Number(a.crnStatus === "pending") || +new Date(a.user.createdAt) - +new Date(b.user.createdAt));
  const chips: ["pending" | "approved" | "rejected" | "all", string, number][] = [
    ["pending", L.status.pending, counts.pending], ["approved", L.status.approved, counts.approved], ["rejected", L.status.rejected, counts.rejected], ["all", L.all, profiles.length],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div role="group" aria-label={L.filterStatus} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))", border: "1px solid var(--c-line,#D4DED8)", borderRadius: "0.875rem", background: "var(--c-card,#fff)", overflow: "hidden" }}>
        {chips.map(([key, label, n]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
            style={{ padding: "0.875rem 1.125rem", textAlign: "start", border: "none", borderInlineEnd: "1px solid var(--c-line,#E9EEEA)", background: filter === key ? "var(--c-soft,#E9EEEA)" : "transparent", cursor: "pointer", display: "grid", gap: "0.25rem", font: "inherit" }}>
            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "1.5rem", fontWeight: 600, color: key === "pending" && n > 0 ? "var(--c-gold,#756039)" : "var(--c-ink,#123F40)", lineHeight: 1 }}>{n}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)" }}>{label}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p style={{ color: "var(--c-muted,#526563)", margin: 0 }}>{filter === "pending" ? L.nobodyWaiting : L.nothingView}</p>}
      {shown.map(p => {
        const st = STATUS_STYLE[p.crnStatus] ?? STATUS_STYLE.pending;
        return (
          <div key={p.id} style={{ background: "var(--c-card,#fff)", borderRadius: "0.875rem", border: "1px solid var(--c-line,#D4DED8)", overflow: "hidden" }}>
            <div style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.125rem", fontWeight: 600, color: "var(--c-ink,#123F40)" }}>{p.companyName}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.625rem", borderRadius: 999, background: st.background, color: st.color }}>{L.status[p.crnStatus] ?? L.status.pending}</span>
                  </div>
                  <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                    {[[L.crn, p.crn], [L.contact, p.contactName], [L.phone, p.phone], [L.emailL, p.user.email]].map(([label, value]) => (
                      <div key={label}>
                        <span style={{ fontSize: "0.6875rem", color: "var(--c-muted,#526563)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label} </span>
                        <span style={{ fontSize: "0.875rem", color: "var(--c-ink,#123F40)", fontFamily: label === L.crn || label === L.emailL || label === L.phone ? "var(--font-jetbrains, monospace)" : undefined, direction: label === L.crn || label === L.emailL || label === L.phone ? "ltr" : undefined, unicodeBidi: "isolate" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)", marginTop: "0.125rem" }}>
                    {L.registeredOn} {new Date(p.user.createdAt).toLocaleDateString(L.dateLocale, { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{L.baseline} <strong>{Math.round(p.baselineScore)}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.625rem", flexShrink: 0 }}>
                  <button
                    onClick={() => respond(p.id, "approve")}
                    disabled={p.crnStatus === "approved" || !!busy}
                    style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "1px solid var(--c-ink,#123F40)", background: p.crnStatus === "approved" ? "var(--c-soft,#E9EEEA)" : "var(--c-btn,#123F40)", color: p.crnStatus === "approved" ? "var(--c-ink,#123F40)" : "var(--c-on-btn,#fff)", fontSize: "0.875rem", fontWeight: 600, cursor: p.crnStatus === "approved" ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                  >
                    {busy === p.id + "approve" ? "…" : p.crnStatus === "approved" ? L.status.approved : L.approve}
                  </button>
                  <button
                    onClick={() => respond(p.id, "reject")}
                    disabled={p.crnStatus === "rejected" || !!busy}
                    style={{ padding: "0.5rem 1.125rem", borderRadius: "0.5rem", border: "1px solid var(--c-line,#D4DED8)", background: p.crnStatus === "rejected" ? "var(--c-err-bg,#FBECEA)" : "var(--c-card,#fff)", color: p.crnStatus === "rejected" ? "var(--c-err,#9E3434)" : "var(--c-muted,#526563)", fontSize: "0.875rem", fontWeight: 600, cursor: p.crnStatus === "rejected" ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                  >
                    {busy === p.id + "reject" ? "…" : p.crnStatus === "rejected" ? L.status.rejected : L.reject}
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

const GROUP_STATUS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)" },
  countered: { bg: "var(--c-warn-bg,#FCF2D9)", color: "var(--c-gold,#756039)" },
  accepted:  { bg: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)" },
  rejected:  { bg: "var(--c-err-bg,#FBECEA)", color: "var(--c-err,#9E3434)" },
};

function LeverageGroupsTable({ token }: { token: string }) {
  const { formatPrice } = useI18n();
  const L = useT();
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
    <div style={{ background: "var(--c-card,#fff)", borderRadius: "0.875rem", border: "1px solid var(--c-line,#D4DED8)", overflow: "hidden" }}>
      <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--c-line,#E9EEEA)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--c-ink,#123F40)" }}>
          {L.groupBuying}
        </div>
        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem", color: "var(--c-muted,#526563)" }}>
          ({L.openN(openGroups.length)})
        </span>
        <div style={{ marginInlineStart: "auto", fontSize: "0.8125rem", color: "var(--c-muted,#526563)" }}>
          {L.approach}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--c-muted,#526563)" }}>{L.loading}</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--c-muted,#526563)" }}>{L.noGroups}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--c-line,#E9EEEA)" }}>
                {[L.thListing, L.thMembers, L.thStatus, L.thCreated].map(h => (
                  <th key={h} style={{ padding: "0.625rem 1.25rem", textAlign: "start", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--c-muted,#526563)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => {
                const st = GROUP_STATUS[g.status] ?? GROUP_STATUS.pending;
                const isHighlight = g.memberCount >= 3 && g.status === "pending";
                return (
                  <tr key={g.id} style={{ borderBottom: i < groups.length - 1 ? "1px solid var(--c-line,#F4F5F0)" : "none", background: isHighlight ? "rgba(31,75,74,0.03)" : "transparent" }}>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <div style={{ fontWeight: 500, color: "var(--c-ink,#123F40)" }}>
                        {g.unitType.project.name} — {g.unitType.unitLabel}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--c-muted,#526563)" }}>
                        {g.unitType.project.location}
                        {g.unitType.price > 0 && ` · ${formatPrice(g.unitType.price)}`}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isHighlight ? "#123F40" : "#526563"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 600, color: isHighlight ? "var(--c-ink,#123F40)" : "var(--c-ink,#123F40)", fontSize: "0.9375rem" }}>
                          {g.memberCount}
                        </span>
                        {isHighlight && (
                          <span style={{ fontSize: "0.6875rem", fontWeight: 600, padding: "0.1rem 0.5rem", borderRadius: 999, background: "var(--c-soft,#E9EEEA)", color: "var(--c-ink,#123F40)" }}>
                            {L.ready}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem" }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem", borderRadius: 999, background: st.bg, color: st.color }}>
                        {L.group[g.status] ?? L.group.pending}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1.25rem", color: "var(--c-muted,#526563)", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                      {new Date(g.createdAt).toLocaleDateString(L.dateLocale, { day: "numeric", month: "short", year: "numeric" })}
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
  const L = useT();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/dev/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <p style={{ color: "var(--c-muted,#526563)" }}>{L.loading}</p>;
  if (!stats) return <p style={{ color: "var(--c-err,#9E3434)" }}>{L.failedStats}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <StatsCards stats={stats} />
      <LeverageGroupsTable token={token} />
      <UserTable token={token} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminApprovalsPage() {
  const router = useRouter();
  const L = useT();
  const [token, setToken] = useState("");
  const [authStatus, setAuthStatus] = useState<"checking" | "ok">("checking");
  const [tab, setTab] = useState<"overview" | "approvals">("overview");

  useEffect(() => {
    // Deferred so the auth decision is not made synchronously inside the effect body.
    const startId = setTimeout(() => {
      const t = localStorage.getItem("token") ?? "";

      if (!t) {
        router.push("/login");
        return;
      }

      // Role comes from the stored profile (the JWT is an httpOnly cookie). Display/redirect only; the API enforces admin.
      const role = currentRole();

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
    }, 0);
    return () => clearTimeout(startId);
  }, [router]);

  // Render nothing until auth is confirmed — prevents any flash of admin content
  if (authStatus === "checking") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--c-soft,#F4F5F0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "2rem", height: "2rem", borderRadius: "50%", border: "2px solid rgba(18,63,64,0.08)", borderTopColor: "var(--c-ink,#123F40)", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.5rem 1.125rem",
    borderRadius: "0.5rem",
    border: "none",
    background: active ? "var(--c-btn,#123F40)" : "transparent",
    color: active ? "var(--c-on-btn,#fff)" : "var(--c-muted,#526563)",
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--c-soft,#F4F5F0)", fontFamily: "var(--font-inter, sans-serif)" }}>
      {/* Header */}
      <div style={{ background: "var(--c-card,#fff)", borderBottom: "1px solid var(--c-line,#D4DED8)" }}>
        <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}>
          <div style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--c-ink,#123F40)", marginBottom: "0.5rem" }}>
            {L.haveniqAdmin}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-fraunces, serif)", fontSize: "1.875rem", fontWeight: 600, color: "var(--c-ink,#123F40)", margin: 0 }}>
                {L.adminDash}
              </h1>
              <p style={{ margin: "0.375rem 0 0", color: "var(--c-muted,#526563)", fontSize: "0.9375rem" }}>
                {L.adminOnly}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.375rem", background: "var(--c-soft,#E9EEEA)", borderRadius: "0.625rem", padding: "0.25rem" }}>
              <button style={tabStyle(tab === "overview")} onClick={() => setTab("overview")}>{L.tabOverview}</button>
              <button style={tabStyle(tab === "approvals")} onClick={() => setTab("approvals")}>{L.tabApprovals}</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "2rem 1.5rem" }}>
        {tab === "overview" && <OverviewTab token={token} />}
        {tab === "approvals" && <ApprovalsTab token={token} />}
      </div>
    </main>
  );
}
