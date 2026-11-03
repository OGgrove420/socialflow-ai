"use client";
// accounts dashboard: connected platforms, statuses, capability chips,
// connect/disconnect/reconnect actions. statuses use the exact labels.
import { useCallback, useEffect, useState } from "react";
import AppShell from "../AppShell";

type Account = {
  id: string;
  platform: string;
  platformUserId: string | null;
  accountName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  status: string;
  tokenExpiresAt: string | null;
  lastPublishAt: string | null;
  expiresSoon: boolean;
};

type PlatformInfo = {
  id: string;
  name: string;
  authType: string;
  capabilities: Record<string, boolean | number | string[]>;
  reviewRequired: boolean;
  reviewNote: string | null;
  fallbackNote: string;
  credentialsConfigured: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  connected: "CONNECTED",
  reauth_required: "REAUTHORISATION REQUIRED",
  expired: "CONNECTION EXPIRED",
  permission_denied: "PERMISSION DENIED",
  disconnected: "DISCONNECTED",
};

const STATUS_COLORS: Record<string, string> = {
  connected: "#2ea043",
  reauth_required: "#d29922",
  expired: "#d29922",
  permission_denied: "#f85149",
  disconnected: "#8b949e",
};

const PLATFORM_ORDER = [
  "facebook", "instagram", "linkedin", "linkedin_page",
  "tiktok", "x", "youtube", "pinterest",
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, PlatformInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setPlatforms(data.platforms ?? {});
    } catch {
      setError("could not load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/cron/kick", { method: "POST" }).catch(() => {});
  }, [load]);

  async function disconnect(id: string) {
    setBusy(id);
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  function connect(platformId: string) {
    window.location.href = `/api/oauth/${platformId}/start`;
  }

  function reconnect(platformId: string) {
    connect(platformId);
  }

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  if (loading) {
    return (
      <AppShell>
        <div style={{ ...main, display: "grid", placeItems: "center" }}>
          <p style={{ opacity: 0.6 }}>loading…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div style={main}>
      <header style={header}>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>social accounts</h1>
          <p style={{ opacity: 0.6, fontSize: 14, margin: "4px 0 0" }}>
            connect once, publish everywhere. you authorise each platform with its official login; socialflow never sees your passwords.
          </p>
        </div>
      </header>

      {error && <p style={errStyle}>{error}</p>}

      <section style={sectionStyle}>
        <h2 style={h2Style}>connected accounts</h2>
        {accounts.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: 14 }}>nothing connected yet. pick a platform below.</p>
        )}
        <div style={gridStyle}>
          {accounts.map((a) => {
            const info = platforms[a.platform];
            const label = STATUS_LABELS[a.status] ?? a.status.toUpperCase();
            const color = STATUS_COLORS[a.status] ?? "#8b949e";
            const caps = (info?.capabilities ?? {}) as Record<string, unknown>;
            const capKeys = ["text", "image", "video", "reels", "stories", "carousel", "schedule", "analytics", "comments"]
              .filter((k) => caps[k] === true);
            return (
              <article key={a.id} style={cardStyle}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {a.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: "50%" }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.accountName ?? a.platformUserId}</div>
                    <div style={{ fontSize: 13, opacity: 0.6 }}>{info?.name ?? a.platform}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color }}>
                  {label}
                  {a.status === "connected" && a.expiresSoon && " — token expires soon"}
                </div>
                {a.tokenExpiresAt && a.status === "connected" && (
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                    token expires {new Date(a.tokenExpiresAt).toLocaleString()}
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {capKeys.map((k) => (
                    <span key={k} style={chipStyle}>{k}</span>
                  ))}
                  {info?.reviewRequired && (
                    <span style={{ ...chipStyle, borderColor: "rgba(210,153,34,0.5)", color: "#d29922" }}>
                      requires app review
                    </span>
                  )}
                </div>
                {a.lastPublishAt && (
                  <div style={{ fontSize: 12, opacity: 0.5, marginTop: 10 }}>
                    last publish {new Date(a.lastPublishAt).toLocaleString()}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  {(a.status !== "connected") && (
                    <button onClick={() => reconnect(a.platform)} style={btnStyle} className="sf-button">
                      reconnect
                    </button>
                  )}
                  <button
                    onClick={() => disconnect(a.id)}
                    disabled={busy === a.id}
                    style={{ ...btnStyle, background: "transparent", border: "1px solid rgba(248,81,73,0.4)", color: "#f85149" }}
                  >
                    {busy === a.id ? "…" : "disconnect"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>available platforms</h2>
        <div style={gridStyle}>
          {PLATFORM_ORDER.filter((p) => platforms[p]).map((p) => {
            const info = platforms[p];
            const connected = connectedPlatforms.has(p) &&
              accounts.some((a) => a.platform === p && a.status === "connected");
            const caps = info.capabilities as Record<string, unknown>;
            const capKeys = ["text", "image", "video", "reels", "stories", "carousel", "schedule", "analytics", "comments"]
              .filter((k) => caps[k] === true);
            const limited = ["stories", "carousel"].filter((k) => caps[k] === false);
            return (
              <article key={p} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600 }}>{info.name}</div>
                  {connected && <span style={{ fontSize: 12, color: "#2ea043" }}>connected</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {capKeys.map((k) => (
                    <span key={k} style={chipStyle}>{k}</span>
                  ))}
                  {limited.map((k) => (
                    <span key={k} style={{ ...chipStyle, opacity: 0.4, textDecoration: "line-through" }}>{k}</span>
                  ))}
                </div>
                {info.reviewRequired && info.reviewNote && (
                  <p style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>{info.reviewNote}</p>
                )}
                {!info.credentialsConfigured && (
                  <p style={{ fontSize: 12, color: "#d29922", marginTop: 10 }}>
                    not configured on this deployment yet (owner must add the developer app credentials).
                  </p>
                )}
                <button
                  onClick={() => connect(p)}
                  disabled={!info.credentialsConfigured}
                  style={{
                    ...btnStyle,
                    marginTop: 14,
                    opacity: info.credentialsConfigured ? 1 : 0.4,
                  }}
                  className="sf-button"
                >
                  {connected ? "connect another" : "connect account"}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      </div>
    </AppShell>
  );
}

const main: React.CSSProperties = {
  padding: "32px 24px",
  maxWidth: 1080,
  margin: "0 auto",
  width: "100%",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
  marginBottom: 32,
};
const sectionStyle: React.CSSProperties = { marginBottom: 40 };
const h2Style: React.CSSProperties = { fontSize: 17, marginBottom: 16, opacity: 0.9 };
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
  gap: 16,
};
const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 20,
};
const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.15)",
  opacity: 0.85,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#7c5cff",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const errStyle: React.CSSProperties = {
  color: "#ff7b72",
  fontSize: 14,
  marginBottom: 16,
};
