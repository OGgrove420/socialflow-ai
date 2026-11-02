"use client";

// x beta: the composer studio, client side. one page, plain flow:
//   1. check connection (calls /api/x/verify)
//   2. write a post (character counter, 280 limit)
//   3. post now (calls /api/x/post) or park it in the queue (localStorage)
// queue rows can be posted later from this same page. nothing auto-posts:
// every publish is a button press, which is the beta honesty rule.

import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  text: string;
  createdAt: string;
  postedId?: string;
  postedAt?: string;
};

const MAX = 280;

export default function XStudio() {
  const [conn, setConn] = useState<
    { state: "checking" } | { state: "ok"; username: string } | { state: "bad"; detail: string }
  >({ state: "checking" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    fetch("/api/x/verify")
      .then((r) => r.json())
      .then((d: { ok?: boolean; username?: string | null; error?: string; stage?: string }) => {
        if (d.ok) setConn({ state: "ok", username: d.username ?? "you" });
        else
          setConn({
            state: "bad",
            detail: d.error ?? d.stage ?? "not configured yet",
          });
      })
      .catch(() => setConn({ state: "bad", detail: "could not reach the server" }));
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem("socialflow_x_queue");
    if (raw) {
      try {
        setQueue(JSON.parse(raw) as QueueItem[]);
      } catch {
        // ignore broken storage
      }
    }
  }, []);

  const saveQueue = (items: QueueItem[]) => {
    setQueue(items);
    window.localStorage.setItem("socialflow_x_queue", JSON.stringify(items));
  };

  const postNow = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/x/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (d.ok) {
        setResult(`posted. tweet id ${d.id}`);
        setText("");
      } else {
        setResult(d.error ?? "posting failed");
      }
    } catch {
      setResult("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const parkInQueue = () => {
    if (!text.trim()) return;
    saveQueue([
      ...queue,
      { id: `${Date.now()}`, text, createdAt: new Date().toISOString() },
    ]);
    setText("");
    setResult("parked in the queue below");
  };

  const postQueued = async (item: QueueItem) => {
    setBusy(true);
    try {
      const res = await fetch("/api/x/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text }),
      });
      const d = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (d.ok) {
        saveQueue(
          queue.map((q) =>
            q.id === item.id
              ? { ...q, postedId: d.id ?? "?", postedAt: new Date().toISOString() }
              : q,
          ),
        );
      }
    } catch {
      setResult("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const removeQueued = (id: string) => saveQueue(queue.filter((q) => q.id !== id));

  return (
    <div className="studio">
      <section className="card">
        <h2>Connection</h2>
        {conn.state === "checking" && <p>checking…</p>}
        {conn.state === "ok" && (
          <p className="conn-ok">
            connected as <strong>@{conn.username}</strong>. posts go out from this account.
          </p>
        )}
        {conn.state === "bad" && (
          <p className="conn-bad">
            not connected yet ({conn.detail}). add the five X_ environment variables on the
            server, then reload this page.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Write a post</h2>
        <textarea
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="what's happening? (beta: plain text, one post at a time)"
          rows={5}
          style={{ width: "100%" }}
        />
        <div className="composer-row">
          <span className={text.length > MAX - 20 ? "count-low" : "count"}>
            {text.length}/{MAX}
          </span>
          <button onClick={parkInQueue} disabled={!text.trim() || busy} className="btn btn-ghost">
            park in queue
          </button>
          <button
            onClick={postNow}
            disabled={!text.trim() || busy || conn.state !== "ok"}
            className="btn btn-primary"
          >
            {busy ? "posting…" : "post now"}
          </button>
        </div>
        {result && <p className="result">{result}</p>}
      </section>

      <section className="card">
        <h2>Queue ({queue.length})</h2>
        {queue.length === 0 && (
          <p>nothing parked. queued posts never auto-post — you press the button.</p>
        )}
        {queue.map((q) => (
          <div className="queue-row" key={q.id}>
            <p>{q.text}</p>
            {q.postedId ? (
              <span className="posted">posted · id {q.postedId}</span>
            ) : (
              <span>
                <button onClick={() => postQueued(q)} disabled={busy} className="btn btn-primary">
                  post
                </button>{" "}
                <button onClick={() => removeQueued(q.id)} className="btn btn-ghost">
                  drop
                </button>
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
