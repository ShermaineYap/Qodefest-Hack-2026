import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CodeBlock from "@/components/beautiful-ui/CodeBlock";
import LoadingState from "@/components/beautiful-ui/LoadingState";
import { Button } from "@/components/beautiful-ui/Button";
import { EntityChip } from "@/components/beautiful-ui/EntityChip";
import { StatusPill } from "@/components/beautiful-ui/StatusPill";
import { FilterChips } from "@/components/ui/FilterChips";
import { SearchField } from "@/components/ui/SearchField";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_BASE ?? "";
const REFRESH_MS = 5000;
const LIMIT = 50;

const KIND_META = {
  chat: { tone: "accent", dot: "var(--accent)", label: "Chat" },
  link: { tone: "green", dot: "var(--green)", label: "Link" },
  panel: { tone: "orange", dot: "var(--orange)", label: "Panel" },
};

const CLIENT_COLORS = ["#5b8def", "#e08a3c", "#25a878", "#a06de0", "#d0568b"];

function clientColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CLIENT_COLORS[hash % CLIENT_COLORS.length];
}

function kindMeta(kind) {
  if (!kind) return null;
  return KIND_META[kind] ?? { tone: "neutral", dot: "var(--ink-3)", label: kind };
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const COLUMNS =
  "grid-cols-[56px_164px_150px_120px_minmax(0,1fr)_210px_44px]";

export default function Dashboard() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(async (signal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFetching(true);
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
    } finally {
      inFlight.current = false;
      if (!signal?.aborted) setFetching(false);
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

  const kindOptions = useMemo(() => {
    const counts = new Map();
    for (const message of messages) {
      const key = message.kind || "(none)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const options = [{ key: "all", label: "All", count: messages.length }];
    for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const meta = key === "(none)" ? null : kindMeta(key);
      options.push({
        key,
        label: meta?.label ?? key,
        count,
        dot: meta?.dot ?? "var(--ink-3)",
      });
    }
    return options;
  }, [messages]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (kindFilter !== "all" && (message.kind || "(none)") !== kindFilter) return false;
      if (!needle) return true;
      return [message.text, message.url, message.client, message.kind]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [messages, query, kindFilter]);

  const initialLoading = status === "loading" && !updatedAt;

  return (
    <>
      <Head>
        <title>Lantern — message log</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col px-4 py-7 sm:px-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-ink text-[15px] font-semibold text-canvas">
                L
              </span>
              <div>
                <h1 className="text-[21px] leading-snug font-semibold tracking-[-0.02em] text-ink">
                  Lantern
                </h1>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Message log — what the extension sent. Read-only, newest first.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill tone={status === "error" ? "red" : status === "ok" ? "green" : "neutral"}>
                {status === "error" ? "Gateway unreachable" : status === "ok" ? "Gateway ok" : "Connecting"}
              </StatusPill>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load()}
                disabled={fetching}
              >
                {fetching ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="w-full max-w-90">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search text, URL, client or kind…"
                ariaLabel="Search messages"
              />
            </div>
            <p className="text-[12px] text-ink-3">
              {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()} · ` : ""}
              refreshes every 5s
            </p>
          </div>

          {status === "error" && (
            <div className="mt-3 rounded-control bg-red-tint px-3 py-2 text-[12.5px] text-red">
              Can&apos;t reach the gateway ({error}). Showing the last {messages.length} messages
              received — nothing is guessed or refreshed silently.
            </div>
          )}

          {messages.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <FilterChips options={kindOptions} active={kindFilter} onChange={setKindFilter} />
              <p className="pr-1 text-[12px] text-ink-3 tabular-nums">
                {visible.length} of {messages.length}
              </p>
            </div>
          )}

          {initialLoading ? (
            <section className="mt-6 flex flex-1 items-start justify-center rounded-card bg-surface px-6 py-24 shadow-card">
              <LoadingState label="Loading messages" variant="Drive" />
            </section>
          ) : status === "error" && messages.length === 0 ? (
            <section className="mt-6 flex flex-1 flex-col items-center justify-center rounded-card bg-surface px-6 py-20 text-center shadow-card">
              <StatusPill tone="red">Gateway unreachable</StatusPill>
              <h2 className="mt-4 text-[17px] font-semibold text-ink">Nothing to show</h2>
              <p className="mt-1 max-w-100 text-[13px] text-ink-2">
                {error}. The dashboard never fills this space with guessed data.
              </p>
              <Button variant="secondary" size="sm" className="mt-5" onClick={() => load()}>
                Try again
              </Button>
            </section>
          ) : messages.length === 0 ? (
            <section className="mt-6 flex flex-1 flex-col items-center justify-center rounded-card bg-surface px-6 py-16 text-center shadow-card">
              <h2 className="text-[17px] font-semibold text-ink">No messages yet</h2>
              <p className="mt-1 text-[13px] text-ink-2">
                Send one from the extension, or try:
              </p>
              <div className="mt-4 w-full max-w-130 text-left">
                <CodeBlock
                  filename="terminal"
                  className="max-w-none"
                  lines={[
                    `curl -s -X POST -H 'Content-Type: application/json' \\`,
                    `  -d '{"v":1,"client":"curl","kind":"chat","text":"hello"}' \\`,
                    "  <this-host>/agent/message",
                  ]}
                />
              </div>
            </section>
          ) : (
            <section
              aria-label="Stored agent messages"
              className="mt-4 overflow-x-auto rounded-card bg-surface shadow-card"
              role="region"
              tabIndex={0}
              style={{ scrollbarWidth: "none" }}
            >
              <div className="min-w-[980px]">
                <div
                  className={`grid ${COLUMNS} border-b border-line bg-inset/40 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3`}
                >
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Id</span>
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Received</span>
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Client</span>
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Kind</span>
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Text</span>
                  <span className="border-r border-[var(--grid-line)] px-3 py-2.5">URL</span>
                  <span className="px-3 py-2.5">
                    <span className="sr-only">Payload</span>
                  </span>
                </div>

                {visible.length === 0 && (
                  <div className="px-4 py-14 text-center">
                    <p className="text-[13px] font-medium text-ink">No matches</p>
                    <p className="mt-1 text-[12px] text-ink-3">Adjust the search or filter.</p>
                  </div>
                )}

                {visible.map((message) => {
                  const meta = kindMeta(message.kind);
                  const expanded = expandedId === message.id;
                  const payloadText = JSON.stringify(message.payload, null, 2);
                  return (
                    <div key={message.id}>
                      <div
                        className={`grid ${COLUMNS} border-b border-[var(--grid-line)] text-[13px] transition-colors duration-100 hover:bg-hover`}
                      >
                        <span className="flex items-center border-r border-[var(--grid-line)] px-3 py-2.5 font-mono text-[12px] text-ink-3 tabular-nums">
                          {message.id}
                        </span>
                        <span className="flex items-center whitespace-nowrap border-r border-[var(--grid-line)] px-3 py-2.5 font-mono text-[12px] text-ink-2 tabular-nums">
                          {formatTime(message.received_at)}
                        </span>
                        <span className="flex min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2.5">
                          {message.client ? (
                            <EntityChip
                              name={message.client}
                              color={clientColor(message.client)}
                              monogram={message.client.charAt(0).toUpperCase()}
                            />
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </span>
                        <span className="flex items-center border-r border-[var(--grid-line)] px-3 py-2.5">
                          {meta ? <StatusPill tone={meta.tone}>{meta.label}</StatusPill> : <span className="text-ink-3">—</span>}
                        </span>
                        <span className="flex min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2.5">
                          <span className="min-w-0 truncate text-ink" title={message.text || undefined}>
                            {message.text || <span className="text-ink-3">—</span>}
                          </span>
                        </span>
                        <span className="flex min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2.5">
                          <span
                            className="min-w-0 truncate font-mono text-[12px] text-ink-2"
                            title={message.url || undefined}
                          >
                            {message.url || <span className="text-ink-3">—</span>}
                          </span>
                        </span>
                        <span className="flex items-center justify-center px-2 py-2">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Hide" : "Show"} payload for message ${message.id}`}
                            onClick={() => setExpandedId(expanded ? null : message.id)}
                            className={`flex size-7 items-center justify-center rounded-full transition-colors duration-100 hover:bg-hover-2 ${
                              expanded ? "text-ink" : "text-ink-3"
                            }`}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-transform duration-300"
                              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                        </span>
                      </div>

                      {expanded && (
                        <div
                          className="border-b border-[var(--grid-line)] bg-inset/50 p-3"
                          style={{ animation: "fade-in 180ms ease-out both" }}
                        >
                          <CodeBlock
                            filename={`message-${message.id}.json`}
                            lines={payloadText.split("\n")}
                            code={payloadText}
                            className="max-w-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-[11.5px] text-ink-3">
            <p>
              Contract: <code className="font-mono">POST /agent/message</code> ·{" "}
              <code className="font-mono">GET /agent/messages</code> — see{" "}
              <code className="font-mono">server/README.md</code>
            </p>
            <p>
              UI primitives by{" "}
              <a
                href="https://www.beautifului.dev/"
                target="_blank"
                rel="noreferrer"
                className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                Beautiful UI
              </a>{" "}
              (MIT)
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
