"use client";

import { useEffect, useState } from "react";
import { buyerMinRooms } from "@/lib/attributes";

/** Role claim of the JWT (display only — the API still checks it), or null. */
function tokenRole(token: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const role = JSON.parse(atob(part)).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * Minimum rooms the signed-in buyer asked for, or null (signed out, not a
 * buyer, or no room count). Used to dim — not hide — apartments with fewer
 * rooms on the project page and in the building's floor picker.
 */
export function useBuyerMinRooms(): number | null {
  const [minRooms, setMinRooms] = useState<number | null>(null);
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t || tokenRole(t) !== "buyer") return;
    let cancelled = false;
    fetch("/api/buyer/profile", { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { buyer_preferences?: Record<string, unknown> } | null) => {
        if (!cancelled) setMinRooms(buyerMinRooms(d?.buyer_preferences));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return minRooms;
}
