"use client";
import { useEffect } from "react";
import { migrateLegacyToken } from "@/lib/clientSession";

/** Renders nothing. Moves a pre-cookie localStorage JWT into the httpOnly session cookie, once per browser. */
export default function SessionMigrator() {
  useEffect(() => { void migrateLegacyToken(); }, []);
  return null;
}
