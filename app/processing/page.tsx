"use client";
/**
 * /processing
 *
 *   1. Read transcriptId from localStorage (set by /interview on conversation end).
 *   2. POST /api/characterize → structured buyer profile.
 *   3. POST /api/match + GET /api/aom → ranked listings.
 *   4. Store in sessionStorage and redirect to /results.
 *
 * Returning buyers with a saved profile (and no fresh transcript) skip
 * characterization and re-run matching only.
 */
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Phase =
  | "waiting"
  | "characterizing"
  | "matching"
  | "done"
  | "error";

const LABEL: Record<Phase, string> = {
  waiting:        "",
  characterizing: "Reading your responses…",
  matching:       "Finding your best matches…",
  done:           "Preparing results…",
  error:          "",
};

type AomDetail = {
  title: string;
  description: string;
  eil: number;
  ail: number;
  price: number;
  priceFrom?: boolean;
  developerId: string;
  ownerType: string;
  attributes: Record<string, unknown>;
};

type CharacterizationResult = {
  buyer_preferences: {
    property_type: string;
    location: string;
    bedrooms: number | null;
    bathrooms: number | null;
    must_haves: string[];
    dealbreakers: string[];
    timeline: string;
    additional_notes: string;
  };
  expected_score_ej: number;
  min_acceptance_score_aj: number;
  behavioral_insights: string;
  intent_signals: string;
  psychometric_scores?: Record<string, number>;
};

export default function ProcessingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [errorMsg, setErrorMsg] = useState("");

  const runMatchFlow = useCallback(async (
    characterization: CharacterizationResult,
    token: string
  ) => {
    const authHeader = { Authorization: `Bearer ${token}` };

    setPhase("matching");
    const [matchRes, aomRes] = await Promise.all([
      fetch("/api/match", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerProfile: {
            expectedScore: characterization.expected_score_ej,
            minAcceptanceScore: characterization.min_acceptance_score_aj,
          },
        }),
      }),
      fetch("/api/aom", { headers: authHeader }),
    ]);

    if (!matchRes.ok) {
      const { error } = await matchRes.json().catch(() => ({ error: matchRes.statusText }));
      throw new Error(`Matching failed: ${error}`);
    }

    const { ranked } = await matchRes.json();

    const aomDetails: Record<string, AomDetail> = {};
    if (aomRes.ok) {
      const { listings } = await aomRes.json();
      for (const l of listings) {
        const title = l.project?.name && l.unitLabel
          ? `${l.project.name} — ${l.unitLabel}`
          : (l.unitLabel ?? l.title ?? "");
        aomDetails[l.id] = {
          title,
          description: l.description ?? "",
          eil: l.eil,
          ail: l.ail,
          price: l.price ?? 0,
          priceFrom: Boolean(l.priceFrom),
          developerId: l.seller?.id ?? "",
          ownerType: (l.ownerType as string) ?? "developer",
          attributes: typeof l.attributes === "string"
            ? JSON.parse(l.attributes)
            : (l.attributes ?? {}),
        };
      }
    }

    setPhase("done");
    sessionStorage.setItem(
      "matchResults",
      JSON.stringify({ ranked, characterization, aomDetails })
    );
    localStorage.removeItem("transcriptId");
    router.push("/results");
  }, [router]);

  const runFlow = useCallback(async (transcriptId: string) => {
    const token = localStorage.getItem("token") ?? "";
    const authHeader = { Authorization: `Bearer ${token}` };

    try {
      setPhase("characterizing");
      const charRes = await fetch("/api/characterize", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId }),
      });
      if (!charRes.ok) {
        const { error } = await charRes.json().catch(() => ({ error: charRes.statusText }));
        throw new Error(`Characterization failed: ${error}`);
      }
      const characterization: CharacterizationResult = await charRes.json();

      await runMatchFlow(characterization, token);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }, [runMatchFlow]);

  useEffect(() => {
    const tid = localStorage.getItem("transcriptId");
    if (tid) {
      runFlow(tid);
      return;
    }

    const token = localStorage.getItem("token") ?? "";
    if (!token) { setPhase("waiting"); return; }

    fetch("/api/buyer/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile: CharacterizationResult | null) => {
        if (profile) {
          runMatchFlow(profile, token);
        } else {
          setPhase("waiting");
        }
      })
      .catch(() => setPhase("waiting"));
  }, [runFlow, runMatchFlow]);

  const isSpinning = phase === "characterizing" || phase === "matching" || phase === "done";

  return (
    <main
      style={{
        position: "fixed",
        top: "3.25rem",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0A0A0A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
        gap: "1.25rem",
      }}
    >
      {isSpinning && (
        <>
          <div
            style={{
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "#C89B3C",
              animation: "spin 0.9s linear infinite",
            }}
          />
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: "0.875rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {LABEL[phase]}
          </p>
        </>
      )}

      {phase === "waiting" && (
        <div style={{ textAlign: "center", maxWidth: "24rem", padding: "1rem" }}>
          <p style={{ color: "#F7F5F1", fontWeight: 600, marginBottom: "0.5rem" }}>
            No interview found
          </p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Start a conversation with the avatar to get matched listings.
          </p>
          <Link
            href="/interview"
            style={{
              display: "inline-block",
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(31,75,74,0.85)",
              color: "#F7F5F1",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start interview
          </Link>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center", maxWidth: "28rem", padding: "1rem" }}>
          <p style={{ color: "#B04040", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.875rem" }}>{errorMsg}</p>
          <Link
            href="/interview"
            onClick={() => sessionStorage.setItem("requestedRetake", "true")}
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.8125rem",
              textDecoration: "none",
            }}
          >
            Back to interview
          </Link>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
