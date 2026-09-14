"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /dev/login is consolidated into the main /login page.
 * This redirect ensures any saved links or bookmarks still work.
 */
export default function DevLoginRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return null;
}
