"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/LocaleProvider";
import { parseLocale } from "@/lib/i18n/locale";
import { TextField, Button } from "@/components/quiet";
import { AuthAside, AuthRoom, translateAuthError } from "@/components/auth/Room";

export default function LoginPage() {
  const router = useRouter();
  const { setLocale, m } = useI18n();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setUnverifiedEmail(null);
    setResendState("idle");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(data.email ?? form.email);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      await setLocale(parseLocale(data.user.locale), { persistRemote: false });

      if (data.user.role === "developer") {
        const meRes = await fetch("/api/dev/me", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const me = await meRes.json();
        if (me.crnStatus === "approved") {
          router.push("/dev/dashboard");
        } else if (me.crnStatus === "rejected") {
          router.push("/dev/rejected");
        } else {
          router.push("/dev/pending");
        }
      } else if (data.user.role === "seller") {
        router.push("/seller/dashboard");
      } else if (data.user.role === "admin") {
        router.push("/dev/admin/approvals");
      } else {
        router.push("/interview");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      setError(translateAuthError(message, m));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!unverifiedEmail || resendState !== "idle") return;
    setResendState("sending");
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: unverifiedEmail }),
    });
    setResendState("sent");
  }

  return (
    <AuthRoom aside={<AuthAside href="/register" prompt={m.auth.noAccount} action={m.auth.registerCta} />}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: 0 }}>{m.auth.welcome}</h1>
      <p className="qp-body">{m.auth.continue}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <TextField
          label={m.auth.email}
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          label={m.auth.password}
          type="password"
          required
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <div className="qp-notice qp-notice--danger" role="alert">{error}</div>}
        {unverifiedEmail && (
          <div className="qp-notice qp-notice--warning">
            <p style={{ margin: "0 0 0.5rem" }}>{m.auth.verifyBody}</p>
            {resendState === "sent" ? (
              <p style={{ margin: 0, color: "var(--qp-ink)", fontWeight: 600 }}>{m.auth.resentBody}</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendState === "sending"}
                style={{ background: "none", border: "none", padding: 0, color: "var(--qp-ink)", fontWeight: 600, cursor: "pointer", font: "inherit", fontSize: "0.9375rem" }}
              >
                {resendState === "sending" ? m.auth.resending : m.auth.resend}
              </button>
            )}
          </div>
        )}
        <Button type="submit" className="qp-btn--block" disabled={loading}>
          {loading ? m.auth.signingIn : m.auth.signIn}
        </Button>
      </form>
      <p style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--qp-muted)", margin: 0 }}>
        <Link href="/forgot-password" style={{ color: "var(--qp-ink)", fontWeight: 600, textDecoration: "none" }}>{m.auth.forgot}</Link>
      </p>
    </AuthRoom>
  );
}
