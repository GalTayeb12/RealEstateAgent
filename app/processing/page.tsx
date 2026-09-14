"use client";
/**
 * /processing — Step 2c
 *
 * Auto-flow (production path):
 *   1. Read transcriptId from localStorage (set by /interview on conversation end).
 *   2. POST /api/characterize → structured buyer profile (ej, aj, preferences).
 *   3. POST /api/match        → ranked AOM results.
 *   4. GET  /api/aom          → AOM details (title, description, attributes).
 *   5. Merge and store in sessionStorage, redirect to /results.
 *
 * DEMO ONLY — PDF upload path (shown when no transcriptId in localStorage):
 *   1. User uploads a PDF with their written requirements.
 *   2. POST /api/demo/parse-pdf → extracts text, calls Claude, returns
 *      CharacterizationResult + persists BuyerProfile.
 *   3. Continues from step 3 above (match → aom → results).
 *
 * Dev shortcut: "Use demo transcript" button fetches the buyer's most recent
 * saved transcript and runs the production flow.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type Phase =
  | "waiting"        // no transcriptId — show PDF upload + dev button
  | "uploading"      // DEMO ONLY — uploading / parsing PDF
  | "characterizing" // calling /api/characterize
  | "matching"       // calling /api/match
  | "done"           // redirecting
  | "error";

const LABEL: Record<Phase, string> = {
  waiting:        "",
  uploading:      "Reading your preferences…",   // DEMO ONLY
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
  // DEMO ONLY — PDF upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Shared: match + aom → sessionStorage → /results ─────────────────────
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
    router.push("/results");
  }, [router]);

  // ── Production flow: transcriptId → characterize → match → results ────────
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

  // Auto-start if transcriptId in localStorage (fresh interview).
  // Fallback: if the user already has a saved profile (returning buyer redirected
  // from /interview), skip characterization and re-run matching directly.
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

  // ── DEMO ONLY — PDF upload → parse-pdf → match → results ─────────────────
  const uploadPdf = useCallback(async () => {
    if (!selectedFile) return;
    const token = localStorage.getItem("token") ?? "";

    try {
      setPhase("uploading");
      setErrorMsg("");

      const formData = new FormData();
      formData.append("file", selectedFile);

      const parseRes = await fetch("/api/demo/parse-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!parseRes.ok) {
        const d = await parseRes.json().catch(() => ({}));
        throw new Error(d.error ?? `PDF parse failed (HTTP ${parseRes.status})`);
      }

      const characterization: CharacterizationResult = await parseRes.json();
      await runMatchFlow(characterization, token);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }, [selectedFile, runMatchFlow]);

  // ── Dev shortcut: use most recent saved transcript ────────────────────────
  const useDemoTranscript = useCallback(async () => {
    const token = localStorage.getItem("token") ?? "";
    try {
      const res = await fetch("/api/transcript/latest", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No saved transcript found — run `node scripts/seed-transcript.mjs` first");
      const { transcriptId } = await res.json();
      localStorage.setItem("transcriptId", transcriptId);
      runFlow(transcriptId);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase("error");
    }
  }, [runFlow]);

  const isSpinning = phase === "uploading" || phase === "characterizing" || phase === "matching" || phase === "done";

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0A0A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)",
        gap: "1.25rem",
      }}
    >
      {/* Spinner + label — shown during all processing phases */}
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

      {/* DEMO ONLY — PDF upload (shown when no transcript in localStorage) */}
      {phase === "waiting" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1.5rem",
            maxWidth: "22rem",
            width: "100%",
            padding: "0 1.5rem",
          }}
        >
          {/* Upload card */}
          {/* DEMO ONLY — this entire card should be removed before production */}
          <div
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#C89B3C",
                  marginBottom: "0.375rem",
                }}
              >
                Demo — Upload requirements PDF
              </div>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                Upload a PDF describing your property requirements. Claude will parse it and find your matches.
              </p>
            </div>

            {/* File input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                style={{ display: "none" }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.4rem",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: selectedFile ? "#F7F5F1" : "rgba(255,255,255,0.4)",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  textAlign: "left",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedFile ? selectedFile.name : "Choose file…"}
              </button>

              <button
                onClick={uploadPdf}
                disabled={!selectedFile}
                style={{
                  padding: "0.625rem 1.25rem",
                  borderRadius: "0.4rem",
                  border: "none",
                  background: selectedFile ? "#1F4B4A" : "rgba(255,255,255,0.08)",
                  color: selectedFile ? "#fff" : "rgba(255,255,255,0.25)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: selectedFile ? "pointer" : "not-allowed",
                  letterSpacing: "0.02em",
                }}
              >
                Upload &amp; find matches
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em" }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
          </div>

          {/* Dev shortcut */}
          <button
            onClick={useDemoTranscript}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(200,155,60,0.4)",
              background: "rgba(200,155,60,0.08)",
              color: "#C89B3C",
              fontSize: "0.8125rem",
              fontWeight: 600,
              letterSpacing: "0.03em",
              cursor: "pointer",
            }}
          >
            Use demo transcript
          </button>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.2)", fontSize: "0.6875rem" }}>
            Dev mode — uses most recent saved transcript
          </p>
        </div>
      )}

      {/* Error state */}
      {phase === "error" && (
        <div style={{ textAlign: "center", maxWidth: "28rem", padding: "1rem" }}>
          <p style={{ color: "#B04040", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </p>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.875rem" }}>{errorMsg}</p>
          <button
            onClick={() => { setPhase("waiting"); setSelectedFile(null); setErrorMsg(""); }}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
