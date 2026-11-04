"use client";
/**
 * /buyer/leverage-groups
 *
 * Two sections:
 *  1. My groups — leverage groups the buyer is a member of.
 *  2. Open groups — pending/countered groups on active listings the buyer
 *     has not yet joined, with a Join button.
 *
 * Creating a group automatically makes the creator the first member.
 * Joining increments the live member count (tracked in LeverageGroupMember).
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeverageGroup {
  id: string;
  memberCount: number; // live count from _count.members, set by the API
  requestedDiscountPercent: number;
  requestedTerms: string;
  status: string;
  counterDiscountPercent: number | null;
  counterTerms: string | null;
  createdAt: string;
  unitType: {
    unitLabel: string;
    price: number;
    project: { name: string; location: string };
  };
}

interface MatchedUnit {
  aomId: string;
  title: string;
  valid: boolean;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_BG: Record<string, { bg: string; color: string }> = {
  pending:   { bg: "#FCF2D9", color: "#756039" },
  countered: { bg: "#FCF2D9", color: "#756039" },
  accepted:  { bg: "#E9EEEA", color: "#123F40" },
  rejected:  { bg: "#FBECEA", color: "#9E3434" },
};

function StatusBadge({ status }: { status: string }) {
  const { m } = useI18n();
  const s = STATUS_BG[status] ?? STATUS_BG.pending;
  const label: Record<string, string> = {
    pending: m.groups.statusPending,
    countered: m.groups.statusCountered,
    accepted: m.groups.statusAccepted,
    rejected: m.groups.statusRejected,
  };
  return (
    <span
      style={{
        fontSize: "0.75rem",
        fontWeight: 600,
        padding: "0.2rem 0.625rem",
        borderRadius: "999px",
        background: s.bg,
        color: s.color,
      }}
    >
      {label[status] ?? m.groups.statusPending}
    </span>
  );
}

function MemberPill({ count }: { count: number }) {
  const { m } = useI18n();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: "#E9EEEA",
        borderRadius: "999px",
        padding: "0.2rem 0.625rem 0.2rem 0.4rem",
      }}
    >
      <svg
        width='12'
        height='12'
        viewBox='0 0 24 24'
        fill='none'
        stroke='#123F40'
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
        <circle cx='9' cy='7' r='4' />
        <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
        <path d='M16 3.13a4 4 0 0 1 0 7.75' />
      </svg>
      <span
        style={{
          fontFamily: "var(--font-heebo, sans-serif)",
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "#123F40",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count} {count === 1 ? m.groups.member : m.groups.members}
      </span>
    </div>
  );
}

// ── My group card ─────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: LeverageGroup }) {
  const { formatPrice, m, locale } = useI18n();
  const isCountered = group.status === "countered";
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "0.875rem",
        border: "1px solid #D4DED8",
        overflow: "hidden",
        borderTop: `4px solid ${group.status === "accepted" ? "#123F40" : group.status === "rejected" ? "#9E3434" : "#756039"}`,
      }}
    >
      <div style={{ padding: "1.25rem 1.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <h3
              style={{
                fontFamily: "var(--font-heebo, sans-serif)",
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#123F40",
                margin: "0 0 0.2rem",
              }}
            >
              {group.unitType.project.name} — {group.unitType.unitLabel}
            </h3>
            <div style={{ fontSize: "0.8125rem", color: "#526563" }}>
              {group.unitType.project.location}
              {group.unitType.price > 0 &&
                ` · ${formatPrice(group.unitType.price)}`}
            </div>
          </div>
          <StatusBadge status={group.status} />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <MemberPill count={group.memberCount} />
          {/* Discount requested 
          <div>
            <span style={{ fontSize: "0.6875rem", color: "#526563", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Discount requested </span>
            <span style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 600, fontSize: "0.9375rem" }}>{group.requestedDiscountPercent}%</span>
          </div>*/}
          {group.requestedTerms && (
            <div style={{ fontSize: "0.875rem", color: "#526563" }}>
              {group.requestedTerms}
            </div>
          )}
        </div>

        {isCountered && group.counterDiscountPercent != null && (
          <div
            style={{
              background: "#FCF2D9",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              border: "1px solid #EDD9A3",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#756039",
                marginBottom: "0.375rem",
              }}
            >
              {m.groups.statusCountered}
            </div>
            <div
              style={{ display: "flex", gap: "1.5rem", fontSize: "0.875rem" }}
            >
              <div>
                <span style={{ color: "#526563" }}>{m.groups.counterDiscount} </span>
                <span
                  style={{
                    fontFamily: "var(--font-heebo, sans-serif)",
                    fontWeight: 600,
                    color: "#756039",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {group.counterDiscountPercent}%
                </span>
              </div>
              {group.counterTerms && (
                <div style={{ color: "#123F40" }}>
                  &ldquo;{group.counterTerms}&rdquo;
                </div>
              )}
            </div>
          </div>
        )}

        <div
          style={{
            fontSize: "0.75rem",
            color: "#526563",
            marginTop: "0.75rem",
          }}
        >
          {m.groups.createdOn}{" "}
          {new Date(group.createdAt).toLocaleDateString(locale === "he" ? "he-IL" : "en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

// ── Joinable group card ───────────────────────────────────────────────────────

function JoinableGroupCard({
  group,
  token,
  onJoined,
}: {
  group: LeverageGroup;
  token: string;
  onJoined: () => void;
}) {
  const { formatPrice, m } = useI18n();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/buyer/leverage-groups/${group.id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setJoined(true);
      onJoined();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setJoining(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "0.875rem",
        border: "1px solid #D4DED8",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "1.125rem 1.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontFamily: "var(--font-heebo, sans-serif)",
                fontSize: "1.0625rem",
                fontWeight: 600,
                color: "#123F40",
                margin: "0 0 0.2rem",
              }}
            >
              {group.unitType.project.name} — {group.unitType.unitLabel}
            </h3>
            <div
              style={{
                fontSize: "0.8125rem",
                color: "#526563",
                marginBottom: "0.625rem",
              }}
            >
              {group.unitType.project.location}
              {group.unitType.price > 0 &&
                ` · ${formatPrice(group.unitType.price)}`}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.875rem",
                alignItems: "center",
              }}
            >
              <MemberPill count={group.memberCount} />
              <span style={{ fontSize: "0.875rem", color: "#526563" }}>
                Requesting{" "}
                <strong style={{ color: "#123F40" }}>
                  {group.requestedDiscountPercent}%
                </strong>{" "}
                discount
              </span>
              {group.requestedTerms && (
                <span style={{ fontSize: "0.8125rem", color: "#526563" }}>
                  &ldquo;{group.requestedTerms}&rdquo;
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.375rem",
            }}
          >
            {joined ? (
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#123F40",
                }}
              >
                {m.groups.joined}
              </span>
            ) : (
              <button
                onClick={join}
                disabled={joining}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "0.5rem",
                  background: "#123F40",
                  color: "#fff",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: joining ? "not-allowed" : "pointer",
                  opacity: joining ? 0.7 : 1,
                }}
              >
                {joining ? m.groups.joining : m.groups.joinGroup}
              </button>
            )}
            {error && (
              <span style={{ fontSize: "0.75rem", color: "#9E3434" }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create form ───────────────────────────────────────────────────────────────

function CreateGroupForm({
  matchedUnits,
  token,
  onCreated,
}: {
  matchedUnits: MatchedUnit[];
  token: string;
  onCreated: () => void;
}) {
  const { m } = useI18n();
  const [unitTypeId, setUnitTypeId] = useState(matchedUnits[0]?.aomId ?? "");
  const [discountPct, setDiscountPct] = useState("5");
  const [terms, setTerms] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    setError("");
    const dp = parseFloat(discountPct);
    if (!unitTypeId) {
      setError(m.groups.selectUnit);
      return;
    }
    if (isNaN(dp) || dp <= 0 || dp > 99) {
      setError(m.groups.discountRange);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/buyer/leverage-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          unitTypeId,
          requestedDiscountPercent: dp,
          requestedTerms: terms,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setSuccess(true);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        style={{
          background: "#E9EEEA",
          borderRadius: "0.75rem",
          padding: "1.25rem 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          border: "1px solid #B8D4D3",
        }}
      >
        <svg
          width='18'
          height='18'
          viewBox='0 0 24 24'
          fill='none'
          stroke='#123F40'
          strokeWidth='2.5'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <polyline points='20 6 9 17 4 12' />
        </svg>
        <div>
          <div
            style={{ fontWeight: 600, color: "#123F40", fontSize: "0.9375rem" }}
          >
            {m.results.groupRegisteredTitle}
          </div>
          <div
            style={{
              fontSize: "0.8125rem",
              color: "#3A6B6A",
              marginTop: "0.125rem",
            }}
          >
            {m.results.requestBody}
          </div>
        </div>
      </div>
    );
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "#526563",
    marginBottom: "0.25rem",
    display: "block",
  };
  const inputStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #D4DED8",
    borderRadius: "0.4rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.9375rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "0.875rem",
        border: "1px solid #D4DED8",
        overflow: "hidden",
      }}
    >
      <div
        style={{ padding: "1rem 1.5rem", borderBottom: "1px solid #E8E4DF" }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#123F40",
          }}
        >
          {m.groups.createGroup}
        </span>
      </div>
      <div
        style={{
          padding: "1.25rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {/* Unit type selector */}
        <div>
          <label style={labelStyle}>{m.groups.selectUnit}</label>
          {matchedUnits.length > 0 ? (
            <select
              value={unitTypeId}
              onChange={(e) => setUnitTypeId(e.target.value)}
              style={{ ...inputStyle, fontFamily: "inherit" }}
            >
              {matchedUnits.map((u) => (
                <option key={u.aomId} value={u.aomId}>
                  {u.title}
                  {!u.valid ? " (not feasible)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                type='text'
                placeholder='Unit type ID'
                value={unitTypeId}
                onChange={(e) => setUnitTypeId(e.target.value)}
                style={inputStyle}
              />
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "#526563",
                  marginTop: "0.25rem",
                }}
              >
                Run{" "}
                <Link href='/processing' style={{ color: "#123F40" }}>
                  matching
                </Link>{" "}
                first to pick from your results.
              </div>
            </>
          )}
        </div>

        {/* Discount */}
        <div>
          <label style={labelStyle}>{m.groups.discount} (%)</label>
          <input
            type='number'
            min={0.5}
            max={99}
            step={0.5}
            value={discountPct}
            onChange={(e) => setDiscountPct(e.target.value)}
            style={{
              ...inputStyle,
              fontFamily: "var(--font-heebo, sans-serif)",
              maxWidth: "10rem",
            }}
          />
        </div>

        {/* Terms */}
        <div>
          <label style={labelStyle}>
            {m.groups.terms}{" "}
            <span style={{ fontWeight: 400, color: "#526563" }}>
              {m.groups.termsOptional}
            </span>
          </label>
          <textarea
            rows={2}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={m.results.termsPh}
            style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}
          />
        </div>

        {error && (
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "#9E3434" }}>
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          style={{
            padding: "0.625rem 1.5rem",
            borderRadius: "0.5rem",
            background: "#123F40",
            color: "#fff",
            border: "none",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
            alignSelf: "flex-start",
          }}
        >
          {submitting ? m.groups.creating : m.groups.createGroup}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BuyerLeverageGroupsPage() {
  const { m } = useI18n();
  const [myGroups, setMyGroups] = useState<LeverageGroup[]>([]);
  const [openGroups, setOpenGroups] = useState<LeverageGroup[]>([]);
  const [matchedUnits, setMatchedUnits] = useState<MatchedUnit[]>([]);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadAll = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const [myRes, openRes] = await Promise.all([
        fetch("/api/buyer/leverage-groups", {
          headers: { Authorization: `Bearer ${t}` },
        }),
        fetch("/api/buyer/leverage-groups?available=true", {
          headers: { Authorization: `Bearer ${t}` },
        }),
      ]);
      const myData = await myRes.json();
      const openData = await openRes.json();
      setMyGroups(myData.groups ?? []);
      setOpenGroups(openData.groups ?? []);
    } catch {
      // network error — leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("token") ?? "";
    setToken(t);

    try {
      const raw = sessionStorage.getItem("matchResults");
      if (raw) {
        const data = JSON.parse(raw);
        setMatchedUnits(
          (data.ranked as MatchedUnit[]).map((r: MatchedUnit) => ({
            aomId: r.aomId,
            title: r.title,
            valid: r.valid,
          })),
        );
      }
    } catch {
      /* absent session — fine */
    }

    loadAll(t);
  }, [loadAll]);

  function handleCreated() {
    setShowForm(false);
    loadAll(token);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F4F5F0",
        fontFamily: "var(--font-inter, sans-serif)",
        paddingBottom: "4rem",
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: "1px solid #D4DED8", background: "#fff" }}>
        <div style={{ maxWidth: "75rem", margin: "0 auto", padding: "1.5rem" }}>
          <div
            style={{
              fontFamily: "var(--font-heebo, sans-serif)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#123F40",
              marginBottom: "0.5rem",
            }}
          >
            Haveniq
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-heebo, sans-serif)",
                  fontSize: "1.875rem",
                  fontWeight: 600,
                  color: "#123F40",
                  margin: 0,
                }}
              >
                {m.groups.title}
              </h1>
              <p
                style={{
                  margin: "0.375rem 0 0",
                  color: "#526563",
                  fontSize: "0.9375rem",
                }}
              >
                {m.groups.subtitle}
              </p>
            </div>
            <div
              style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}
            >
              <Link
                href='/results'
                style={{
                  fontSize: "0.875rem",
                  color: "#526563",
                  textDecoration: "none",
                }}
              >
                {m.offers.backToResults}
              </Link>
              <button
                onClick={() => setShowForm((f) => !f)}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "0.5rem",
                  background: showForm ? "#E9EEEA" : "#123F40",
                  color: showForm ? "#526563" : "#fff",
                  border: showForm ? "1px solid #D4DED8" : "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {showForm ? m.common.cancel : m.groups.createGroup}
              </button>
            </div>
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
        {/* How it works */}
        <div
          style={{
            background: "#fff",
            borderRadius: "0.875rem",
            border: "1px solid #D4DED8",
            padding: "1.125rem 1.5rem",
            display: "flex",
            gap: "0.875rem",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              background: "#E9EEEA",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width='14'
              height='14'
              viewBox='0 0 24 24'
              fill='none'
              stroke='#123F40'
              strokeWidth='2.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <circle cx='12' cy='12' r='10' />
              <line x1='12' y1='8' x2='12' y2='12' />
              <line x1='12' y1='16' x2='12.01' y2='16' />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: "0.9375rem",
                color: "#123F40",
                marginBottom: "0.25rem",
              }}
            >
              {m.results.groupCtaTitle}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "#526563",
                lineHeight: 1.6,
              }}
            >
              {m.results.groupCtaBody}
            </p>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <CreateGroupForm
            matchedUnits={matchedUnits}
            token={token}
            onCreated={handleCreated}
          />
        )}

        {loading && <p style={{ color: "#526563" }}>{m.common.loading}</p>}

        {/* My groups */}
        {!loading && (
          <>
            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#526563",
                  marginBottom: "0.75rem",
                }}
              >
                {m.groups.myGroups} ({myGroups.length})
              </div>
              {myGroups.length === 0 && !showForm ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem 1.5rem",
                    background: "#fff",
                    borderRadius: "0.875rem",
                    border: "1px solid #D4DED8",
                    color: "#526563",
                  }}
                >
                  <p style={{ margin: "0 0 1rem", fontSize: "0.9375rem" }}>
                    {m.groups.emptyMy}
                  </p>
                  <button
                    onClick={() => setShowForm(true)}
                    style={{
                      padding: "0.5rem 1.25rem",
                      borderRadius: "0.5rem",
                      background: "#123F40",
                      color: "#fff",
                      border: "none",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {m.groups.createGroup}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {myGroups.map((g) => (
                    <GroupCard key={g.id} group={g} />
                  ))}
                </div>
              )}
            </div>

            {/* Open groups to join */}
            {openGroups.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#526563",
                    marginBottom: "0.75rem",
                  }}
                >
                  {m.groups.openGroups} ({openGroups.length})
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.875rem",
                  }}
                >
                  {openGroups.map((g) => (
                    <JoinableGroupCard
                      key={g.id}
                      group={g}
                      token={token}
                      onJoined={() => loadAll(token)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
