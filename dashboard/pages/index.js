import Head from "next/head";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_BASE ?? "";
const REFRESH_MS = 5000;
const LIMIT = 50;

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Payload({ payload }) {
  return (
    <details>
      <summary>payload</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
      <style jsx>{`
        summary {
          cursor: pointer;
          color: #8b98a9;
          font-size: 12px;
        }
        pre {
          margin: 8px 0 0;
          padding: 10px;
          background: #0b0e13;
          border: 1px solid #232a35;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 320px;
          overflow: auto;
        }
      `}</style>
    </details>
  );
}

export default function Dashboard() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (signal) => {
    try {
      const res = await fetch(`${API_BASE}/agent/messages?limit=${LIMIT}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error(`gateway answered ${res.status}`);
      const rows = await res.json();
      if (signal?.aborted) return;
      setMessages(Array.isArray(rows) ? rows : []);
      setUpdatedAt(new Date());
      setStatus("ok");
      setError("");
    } catch (err) {
      if (signal?.aborted) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "request failed");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);

  return (
    <>
      <Head>
        <title>Lantern — message log</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main>
        <div className="wrap">
          <header>
            <div>
              <h1>Lantern</h1>
              <p className="sub">Message log — what the extension sent. Read-only, newest first.</p>
            </div>
            <button type="button" onClick={() => load()} disabled={status === "loading"}>
              Refresh
            </button>
          </header>

          <div className={`status ${status}`}>
            <span className="dot" aria-hidden="true" />
            {status === "error" ? (
              <span>
                Can&apos;t reach the gateway ({error}). Showing the last {messages.length} messages
                received.
              </span>
            ) : status === "loading" && !updatedAt ? (
              <span>Loading…</span>
            ) : (
              <span>
                {messages.length} message{messages.length === 1 ? "" : "s"} · updated{" "}
                {updatedAt ? updatedAt.toLocaleTimeString() : "—"} · refreshes every 5s
              </span>
            )}
          </div>

          {messages.length === 0 && status !== "loading" ? (
            <section className="empty">
              <h2>No messages yet</h2>
              <p>Send one from the extension, or try:</p>
              <pre>
                {`curl -s -X POST -H 'Content-Type: application/json' \\\n  -d '{"v":1,"client":"curl","kind":"chat","text":"hello"}' \\\n  <this-host>/agent/message`}
              </pre>
            </section>
          ) : (
            <div className="tableWrap">
              <table>
                <caption>Stored agent messages</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Received</th>
                    <th scope="col">Client</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Text</th>
                    <th scope="col">URL</th>
                    <th scope="col">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id}>
                      <td className="id">{m.id}</td>
                      <td className="time">{formatTime(m.received_at)}</td>
                      <td>{m.client ? <span className="chip">{m.client}</span> : <span className="muted">—</span>}</td>
                      <td>{m.kind ? <span className="chip">{m.kind}</span> : <span className="muted">—</span>}</td>
                      <td className="text">{m.text || <span className="muted">—</span>}</td>
                      <td className="url">
                        {m.url ? (
                          <span title={m.url}>{m.url}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Payload payload={m.payload} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer>
            Contract: <code>POST /agent/message</code> and <code>GET /agent/messages</code> — see
            <code> server/README.md</code>.
          </footer>
        </div>
      </main>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: #0e1116;
          color: #e5eaf0;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }
        code,
        pre {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
      `}</style>
      <style jsx>{`
        main {
          min-height: 100vh;
          padding: 32px 20px 48px;
        }
        .wrap {
          max-width: 1100px;
          margin: 0 auto;
        }
        header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        h1 {
          margin: 0;
          font-size: 26px;
          letter-spacing: 0.2px;
        }
        .sub {
          margin: 4px 0 0;
          color: #8b98a9;
          font-size: 14px;
        }
        button {
          background: #1b2330;
          color: #e5eaf0;
          border: 1px solid #2e3a4b;
          border-radius: 6px;
          padding: 8px 14px;
          font-size: 14px;
          cursor: pointer;
        }
        button:hover:not(:disabled) {
          background: #232d3d;
        }
        button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 18px 0;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 13px;
          background: #141a22;
          border: 1px solid #232a35;
          color: #b7c2d0;
        }
        .status.error {
          border-color: #6b2b2b;
          background: #1d1313;
          color: #f0b4b4;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #7a8797;
          flex: none;
        }
        .status.ok .dot {
          background: #4f9d69;
        }
        .status.error .dot {
          background: #c45454;
        }
        .tableWrap {
          overflow-x: auto;
          border: 1px solid #232a35;
          border-radius: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 820px;
        }
        caption {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        th {
          text-align: left;
          font-weight: 600;
          color: #8b98a9;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          padding: 12px;
          border-bottom: 1px solid #232a35;
          background: #11161d;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #1a212b;
          vertical-align: top;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        tbody tr:hover {
          background: #11161d;
        }
        .id {
          color: #8b98a9;
          font-variant-numeric: tabular-nums;
        }
        .time {
          white-space: nowrap;
          color: #b7c2d0;
        }
        .text {
          max-width: 340px;
          word-break: break-word;
        }
        .url {
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #9fc4e8;
        }
        .chip {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          background: #1b2330;
          border: 1px solid #2e3a4b;
          font-size: 12px;
          white-space: nowrap;
        }
        .muted {
          color: #5c6878;
        }
        .empty {
          border: 1px dashed #2e3a4b;
          border-radius: 8px;
          padding: 28px;
          text-align: center;
          color: #b7c2d0;
        }
        .empty h2 {
          margin: 0 0 6px;
          font-size: 18px;
          color: #e5eaf0;
        }
        .empty pre {
          display: inline-block;
          text-align: left;
          margin: 14px 0 0;
          padding: 12px;
          background: #0b0e13;
          border: 1px solid #232a35;
          border-radius: 6px;
          font-size: 12px;
          line-height: 1.6;
          overflow-x: auto;
          max-width: 100%;
        }
        footer {
          margin-top: 18px;
          color: #5c6878;
          font-size: 12px;
        }
        footer code {
          color: #8b98a9;
        }
      `}</style>
    </>
  );
}
