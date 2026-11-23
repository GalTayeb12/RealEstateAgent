"use client";

import { useEffect, useState } from "react";
import { buyerMinRooms } from "@/lib/attributes";
import { currentRole } from "@/lib/clientSession";

/**
 * Minimum rooms the signed-in buyer asked for, or null (signed out, not a
 * buyer, or no room count). Used to dim — not hide — apartments with fewer
 * rooms on the project page and in the building's floor picker.
 */
export function useBuyerMinRooms(): number | null {
  const [minRooms, setMinRooms] = useState<number | null>(null);
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t || currentRole() !== "buyer") return;
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
