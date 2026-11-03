// login: email-first. with a password -> sign up / sign in.
// without -> magic link to {SUPABASE_URL}/auth/v1/otp
"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("magic");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error("app is not configured (missing NEXT_PUBLIC_SUPABASE_URL)");
      const anonKey =
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
        (await fetch("/api/auth/config").then((r) => r.json()).then((d) => d.anonKey));

      if (mode === "magic") {
        const res = await fetch(`${supabaseUrl}/auth/v1/otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({
            email,
            create_user: true,
            go_true_host_url: undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string };
          throw new Error(data.msg ?? data.error_description ?? `magic link failed (${res.status})`);
        }
        setMessage("check your email: the login link is on its way. it opens back here.");
      } else {
        // try sign in first; on missing user, sign up
        let res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ email, password }),
        });
        if (res.status === 400) {
          res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: anonKey },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string };
            throw new Error(data.msg ?? data.error_description ?? `sign up failed (${res.status})`);
          }
          setMessage("account created. if email confirmation is on, confirm first, then sign in.");
          setBusy(false);
          return;
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { msg?: string; error_description?: string };
          throw new Error(data.msg ?? data.error_description ?? `sign in failed (${res.status})`);
        }
        const data = (await res.json()) as { access_token?: string };
        if (data.access_token) {
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: data.access_token }),
          });
          window.location.href = "/accounts";
          return;
        }
        throw new Error("no session returned");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={mainStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>log in</h1>
        <p style={{ opacity: 0.6, fontSize: 14, marginBottom: 24 }}>
          no passwords to remember: we send a one-time link. or set a password below.
        </p>
        <form onSubmit={submit}>
          <label style={labelStyle}>
            email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@example.com"
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setMode("magic")}
              style={{ ...tabStyle, ...(mode === "magic" ? tabActive : {}) }}
            >
              magic link
            </button>
            <button
              type="button"
              onClick={() => setMode("password")}
              style={{ ...tabStyle, ...(mode === "password" ? tabActive : {}) }}
            >
              password
            </button>
          </div>
          {mode === "password" && (
            <label style={labelStyle}>
              password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="at least 8 characters"
              />
            </label>
          )}
          <button type="submit" disabled={busy} style={buttonStyle} className="sf-button">
            {busy ? "working…" : mode === "magic" ? "send login link" : "sign in / create account"}
          </button>
        </form>
        {message && <p style={msgStyle}>{message}</p>}
        {error && <p style={errStyle}>{error}</p>}
        <p style={{ opacity: 0.5, fontSize: 13, marginTop: 24 }}>
          <Link href="/">back to home</Link>
        </p>
      </div>
    </main>
  );
}

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "var(--background, #0a0a0f)",
  color: "var(--foreground, #eaeaf0)",
  padding: 24,
};
const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: 32,
};
const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  opacity: 0.8,
  marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "inherit",
  fontSize: 15,
};
const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "none",
  background: "#7c5cff",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 8,
};
const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "transparent",
  color: "inherit",
  fontSize: 13,
  cursor: "pointer",
};
const tabActive: React.CSSProperties = {
  background: "rgba(124,92,255,0.15)",
  borderColor: "rgba(124,92,255,0.4)",
};
const msgStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 14,
  color: "#7ee787",
};
const errStyle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 14,
  color: "#ff7b72",
};
