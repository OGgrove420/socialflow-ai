"use client";
// /auth/callback — supabase magic links land here with the token in the URL
// fragment (#access_token=...). fragments never reach the server, so this is
// a client page: it reads the fragment, verifies it via /api/auth/session
// (which also sets the HttpOnly cookie), then redirects to /accounts.
import { useEffect, useState } from "react";

export default function AuthCallback() {
  const [status, setStatus] = useState("signing in…");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const error = params.get("error_description");

    if (error) {
      setStatus(`sign-in failed: ${decodeURIComponent(error)}`);
      return;
    }
    if (!accessToken) {
      setStatus("no token in this link. open the email link again or request a new one.");
      return;
    }
    fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setStatus(`sign-in failed: ${data.error ?? res.status}`);
          return;
        }
        window.location.replace("/accounts?welcome=1");
      })
      .catch(() => setStatus("network error reaching the server"));
  }, []);

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#0a0a0f",
      color: "#eaeaf0",
      fontFamily: "system-ui",
      padding: 24,
    }}>
      <p style={{ opacity: 0.7 }}>{status}</p>
    </main>
  );
}
