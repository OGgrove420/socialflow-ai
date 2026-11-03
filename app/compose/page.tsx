"use client";
// compose: pick connected accounts, write once, override captions per platform,
// attach media urls, preview char counts, publish now or schedule.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Account = {
  id: string;
  platform: string;
  accountName: string | null;
  avatarUrl: string | null;
  status: string;
};

type PlatformInfo = {
  id: string;
  name: string;
  capabilities: {
    text: boolean; image: boolean; video: boolean; reels: boolean; stories: boolean;
    carousel: boolean; schedule: boolean; analytics: boolean; comments: boolean;
    maxCaption: number; notes: string[];
  };
  reviewRequired: boolean;
  fallbackNote: string;
  credentialsConfigured: boolean;
};

type TargetResult = {
  targetId: string;
  platform: string;
  status: string;
  remoteUrl?: string | null;
  error?: string | null;
  warnings?: string[];
};

export default function ComposePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platforms, setPlatforms] = useState<Record<string, PlatformInfo>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaInput, setMediaInput] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<{ platform: string; problem: string; fallbackNote?: string }[]>([]);
  const [results, setResults] = useState<{ postStatus?: string; results?: TargetResult[]; scheduled?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json();
    const connected = (data.accounts ?? []) as Account[];
    setAccounts(connected.filter((a) => a.status === "connected"));
    setPlatforms(data.platforms ?? {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasImage = useMemo(() => mediaUrls.some((u) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)), [mediaUrls]);
  const hasVideo = useMemo(() => mediaUrls.some((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u)), [mediaUrls]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addMedia() {
    const url = mediaInput.trim();
    if (url && /^https:\/\//.test(url)) {
      setMediaUrls((prev) => [...prev, url]);
      setMediaInput("");
    }
  }

  function previewFor(platform: string): { used: number; max: number; warnings: string[] } {
    const info = platforms[platform];
    const max = info?.capabilities.maxCaption ?? 5000;
    const caption = overrides[platform] ?? body;
    const warnings: string[] = [];
    if (info) {
      if (hasImage && !info.capabilities.image && !info.capabilities.video) {
        warnings.push("no image support: image will be dropped");
      }
      if (hasVideo && !info.capabilities.video) {
        warnings.push("no video support: video will be dropped");
      }
      if (!hasImage && !hasVideo && !info.capabilities.text) {
        warnings.push("media-only platform: add an image or video");
      }
      if (scheduleAt && !info.capabilities.schedule) {
        warnings.push("no scheduled publishing: falls back to a manual reminder");
      }
      for (const n of info.capabilities.notes.slice(0, 2)) {
        warnings.push(n);
      }
    }
    return { used: caption.length, max, warnings };
  }

  async function submit(scheduled: boolean) {
    setBusy(true);
    setError(null);
    setProblems([]);
    setResults(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          mediaUrls,
          scheduleAt: scheduled && scheduleAt ? new Date(scheduleAt).toISOString() : null,
          targets: [...selected].map((accountId) => ({
            accountId,
            caption: overrides[accountId] ?? undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.problems) setProblems(data.problems);
        setError(data.error ?? `failed (${res.status})`);
        return;
      }
      setResults(data);
      setBody("");
      setOverrides({});
      setMediaUrls([]);
      setScheduleAt("");
      setSelected(new Set());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedAccounts = accounts.filter((a) => selected.has(a.id));

  return (
    <main style={main}>
      <header style={header}>
        <h1 style={{ fontSize: 24, margin: 0 }}>compose</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/accounts">accounts</Link>
          <Link href="/">home</Link>
        </nav>
      </header>

      <div style={layout}>
        <section style={panel}>
          <h2 style={h2}>accounts</h2>
          {accounts.length === 0 && (
            <p style={{ opacity: 0.6, fontSize: 14 }}>
              no connected accounts. <Link href="/accounts">connect one first</Link>.
            </p>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {accounts.map((a) => (
              <label key={a.id} style={accountRow(selected.has(a.id))}>
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                {a.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatarUrl} alt="" width={28} height={28} style={{ borderRadius: "50%" }} />
                )}
                <span style={{ fontWeight: 600 }}>{a.accountName}</span>
                <span style={{ opacity: 0.5, fontSize: 12 }}>{platforms[a.platform]?.name ?? a.platform}</span>
              </label>
            ))}
          </div>

          <h2 style={{ ...h2, marginTop: 28 }}>media (public urls)</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={mediaInput}
              onChange={(e) => setMediaInput(e.target.value)}
              placeholder="https://cdn.example.com/photo.jpg"
              style={inputStyle}
            />
            <button onClick={addMedia} style={btnStyle} className="sf-button">add</button>
          </div>
          {mediaUrls.length > 0 && (
            <ul style={{ marginTop: 10, fontSize: 13, opacity: 0.7, paddingLeft: 18 }}>
              {mediaUrls.map((u) => (
                <li key={u}>
                  {u.split("/").pop()} ({hasVideo && /\.(mp4|mov|webm)/.test(u) ? "video" : "image"})
                  <button
                    onClick={() => setMediaUrls((prev) => prev.filter((x) => x !== u))}
                    style={{ marginLeft: 8, background: "none", border: "none", color: "#ff7b72", cursor: "pointer" }}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h2 style={{ ...h2, marginTop: 28 }}>schedule</h2>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            style={inputStyle}
          />
          <p style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>
            your local timezone. platforms without api scheduling fall back to a manual reminder.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <button
              onClick={() => submit(false)}
              disabled={busy || selected.size === 0}
              style={{ ...btnStyle, flex: 1, padding: "12px 0" }}
              className="sf-button"
            >
              {busy ? "publishing…" : "publish now"}
            </button>
            <button
              onClick={() => submit(true)}
              disabled={busy || selected.size === 0 || !scheduleAt}
              style={{ ...btnSecondary, flex: 1, padding: "12px 0" }}
            >
              schedule
            </button>
          </div>
        </section>

        <section style={panel}>
          <h2 style={h2}>post</h2>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="write your post…"
            rows={6}
            style={{ ...inputStyle, width: "100%", resize: "vertical" }}
          />

          {selectedAccounts.length > 0 && (
            <>
              <h2 style={{ ...h2, marginTop: 28 }}>per-platform preview</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {selectedAccounts.map((a) => {
                  const p = previewFor(a.platform);
                  const over = p.used > p.max;
                  return (
                    <div key={a.id} style={previewCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {platforms[a.platform]?.name ?? a.platform} — {a.accountName}
                        </div>
                        <div style={{ fontSize: 12, color: over ? "#f85149" : "inherit", opacity: over ? 1 : 0.6 }}>
                          {p.used}/{p.max}
                        </div>
                      </div>
                      <textarea
                        value={overrides[a.platform] ?? body}
                        onChange={(e) => setOverrides((prev) => ({ ...prev, [a.platform]: e.target.value }))}
                        rows={3}
                        style={{ ...inputStyle, width: "100%", marginTop: 8, resize: "vertical", fontSize: 13 }}
                      />
                      {p.warnings.length > 0 && (
                        <ul style={{ fontSize: 11, opacity: 0.55, marginTop: 6, paddingLeft: 16 }}>
                          {p.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && <p style={{ color: "#ff7b72", fontSize: 14, marginTop: 16 }}>{error}</p>}
          {problems.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              {problems.map((pr, i) => (
                <p key={i} style={{ color: "#d29922" }}>
                  {pr.platform}: {pr.problem}
                  {pr.fallbackNote && <span style={{ opacity: 0.6 }}> — fallback: {pr.fallbackNote}</span>}
                </p>
              ))}
            </div>
          )}
          {results && (
            <div style={{ marginTop: 16, fontSize: 13 }}>
              {results.scheduled && (
                <p style={{ color: "#7ee787" }}>scheduled for {new Date(results.scheduled).toLocaleString()}</p>
              )}
              {results.postStatus && (
                <p style={{ opacity: 0.7 }}>status: {results.postStatus}</p>
              )}
              {results.results?.map((r) => (
                <p key={r.targetId} style={{ color: r.status === "published" ? "#7ee787" : "#f85149" }}>
                  {r.platform}: {r.status}
                  {r.remoteUrl && <> — <a href={r.remoteUrl} target="_blank" rel="noreferrer">view</a></>}
                  {r.error && <> — {r.error}</>}
                  {r.warnings?.map((w, i) => <em key={i} style={{ opacity: 0.6 }}> ({w})</em>)}
                </p>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const main: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a0f",
  color: "#eaeaf0",
  fontFamily: "system-ui",
  padding: "32px 24px",
  maxWidth: 1200,
  margin: "0 auto",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 28,
};
const layout: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 360px) 1fr",
  gap: 24,
  alignItems: "start",
};
const panel: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};
const h2: React.CSSProperties = { fontSize: 15, marginBottom: 12, opacity: 0.85 };
const accountRow = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${active ? "rgba(124,92,255,0.5)" : "rgba(255,255,255,0.08)"}`,
  background: active ? "rgba(124,92,255,0.08)" : "transparent",
  cursor: "pointer",
  fontSize: 14,
});
const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "inherit",
  fontSize: 14,
};
const btnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#7c5cff",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  ...btnStyle,
  background: "transparent",
  border: "1px solid rgba(124,92,255,0.5)",
  color: "#b9a8ff",
};
const previewCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  padding: 14,
};
