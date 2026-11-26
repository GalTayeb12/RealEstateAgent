"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ACTIONS: Record<string, { action: string; label: string }[]> = {
  draft: [{ action: "submit", label: "Submit for review" }],
  review: [{ action: "publish", label: "Approve" }, { action: "return", label: "Back to draft" }],
  published: [{ action: "retire", label: "Retire" }],
  retired: [{ action: "reopen", label: "Re-publish" }],
};

export default function CatalogActions({ type, id, version, status, disabled }: { type: string; id: string; version: number; status: string; disabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (action: string) => {
    const res = await fetch("/api/dev/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, version, action }) });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `now ${j.status}` : j.error ?? "failed");
    router.refresh();
  };
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {(ACTIONS[status] ?? []).map((a) => (
        <button key={a.action} type="button" disabled={disabled} onClick={() => void run(a.action)} style={{ fontSize: 12 }}>{a.label}</button>
      ))}
      {msg && <small>{msg}</small>}
    </span>
  );
}
