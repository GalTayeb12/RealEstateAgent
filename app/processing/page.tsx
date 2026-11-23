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
import { runMatch, type CharacterizationResult } from "@/lib/matchFlow";
import { useAudioUnlock } from "@/components/AudioUnlockProvider";
import { useI18n } from "@/components/LocaleProvider";

type Phase =
  | "waiting"
  | "characterizing"
  | "matching"
  | "done"
  | "error";

export default function ProcessingPage() {
  const router = useRouter();
  const { unlock } = useAudioUnlock();
  const { m } = useI18n();
  const copy = m.processing;
  const [phase, setPhase] = useState<Phase>("waiting");
  const [errorMsg, setErrorMsg] = useState("");

  const runMatchFlow = useCallback(async (characterization: CharacterizationResult) => {
    setPhase("matching");
    await runMatch(characterization);
    setPhase("done");
    localStorage.removeItem("transcriptId");
    router.push("/results");
  }, [router]);

  const runFlow = useCallback(async (transcriptId: string) => {
    const authHeader = { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };

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

      await runMatchFlow(characterization);
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
          runMatchFlow(profile).catch((err) => { setErrorMsg((err as Error).message); setPhase("error"); });
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
        background: "var(--qp-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-heebo, sans-serif)",
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
              border: "2px solid var(--qp-border)",
              borderTopColor: "var(--qp-ink)",
              animation: "spin 0.9s linear infinite",
            }}
          />
          <p
            style={{
              color: "var(--qp-muted)",
              fontSize: "0.875rem",
            }}
          >
            {phase === "characterizing" ? copy.labelCharacterizing
              : phase === "matching"    ? copy.labelMatching
              : copy.labelDone}
          </p>
        </>
      )}

      {phase === "waiting" && (
        <div style={{ textAlign: "center", maxWidth: "24rem", padding: "1rem" }}>
          <p style={{ color: "var(--qp-ink)", fontWeight: 500, marginBottom: "0.5rem" }}>
            {copy.waitingTitle}
          </p>
          <p style={{ color: "var(--qp-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            {copy.waitingBody}
          </p>
          <button
            type="button"
            onClick={() => { void unlock(); router.push("/interview"); }}
            style={{
              display: "inline-block",
              padding: "0.625rem 1.5rem",
              borderRadius: 999,
              border: "1px solid transparent",
              background: "var(--qp-ink)",
              color: "var(--qp-on-primary)",
              minHeight: 48,
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copy.startInterview}
          </button>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center", maxWidth: "28rem", padding: "1rem" }}>
          <p style={{ color: "var(--qp-error)", fontWeight: 600, marginBottom: "0.5rem" }}>
            {copy.errorTitle}
          </p>
          <p style={{ color: "var(--qp-muted)", fontSize: "0.875rem" }}>{errorMsg}</p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem("requestedRetake", "true");
              void unlock();
              router.push("/interview");
            }}
            style={{
              display: "inline-block",
              marginTop: "1.5rem",
              padding: "0.625rem 1.5rem",
              borderRadius: 999,
              border: "1px solid var(--qp-border)",
              background: "var(--qp-surface)",
              color: "var(--qp-ink)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            {copy.backToInterview}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
