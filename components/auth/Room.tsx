"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { Ambient, Brand, HqLang } from "@/components/ui";
import "@/components/ui/haven.css";

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
    <main className="hq">
      <Ambient />
      <header className="hq-nav">
        <Brand />
        <div className="hq-nav__actions">
          {aside}
          <HqLang />
        </div>
      </header>
      <div className="hq-auth">{children}</div>
    </main>
  );
}

export function AuthAside({ href, prompt, action }: { href: string; prompt: string; action: string }) {
  return (
    <Link className="hq-nav__start" href={href} style={{ color: "var(--hq-muted)", textDecoration: "none", fontWeight: 650, fontSize: "0.9rem" }}>
      {prompt} <span style={{ color: "var(--hq-teal)" }}>{action}</span>
    </Link>
  );
}
