"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { Logo } from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import "@/components/quiet/quiet.css";

const KNOWN = {
  "Invalid credentials": "invalid",
  "Email already registered": "emailTaken",
} as const;

export function translateAuthError(
  message: string,
  m: { auth: { invalid: string; emailTaken: string; generic: string } },
) {
  const key = KNOWN[message as keyof typeof KNOWN];
  return key ? m.auth[key] : m.auth.generic;
}

export function AuthRoom({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <main className="qp-auth">
      {/* Left: image panel */}
      <div className="qp-auth__side">
        <div className="qp-auth__side-brand">
          <Logo href="/" height={22} />
        </div>
        <Image
          src="/images/auth-side.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
        />
      </div>

      {/* Right: form column */}
      <div className="qp-auth__form">
        <div className="qp-auth__card">
          {/* Top bar: logo (mobile) + lang toggle + aside link */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="qp-auth__mobile-logo">
              <Logo href="/" height={20} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginInlineStart: "auto" }}>
              {aside}
              <LanguageToggle />
            </div>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

export function AuthAside({ href, prompt, action }: { href: string; prompt: string; action: string }) {
  return (
    <Link href={href} style={{ color: "var(--qp-muted)", textDecoration: "none", fontWeight: 500, fontSize: "0.875rem", whiteSpace: "nowrap" }}>
      {prompt} <span style={{ color: "var(--qp-ink)", fontWeight: 600 }}>{action}</span>
    </Link>
  );
}
