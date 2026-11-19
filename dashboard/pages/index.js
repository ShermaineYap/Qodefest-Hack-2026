import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CodeBlock from "@/components/beautiful-ui/CodeBlock";
import LoadingState from "@/components/beautiful-ui/LoadingState";
import { Button, buttonVariants } from "@/components/beautiful-ui/Button";
import { Chip } from "@/components/beautiful-ui/Chip";
import { EntityChip } from "@/components/beautiful-ui/EntityChip";
import { StatusPill } from "@/components/beautiful-ui/StatusPill";
import { FilterChips } from "@/components/ui/FilterChips";
import { SearchField } from "@/components/ui/SearchField";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_BASE ?? "";
const REFRESH_MS = 5000;
const LIMIT = 100;

const KIND_META = {
  chat: { tone: "accent", dot: "var(--accent)", label: "Chat" },
  link: { tone: "green", dot: "var(--green)", label: "Link" },
  panel: { tone: "orange", dot: "var(--orange)", label: "Panel" },
};

const STATUS_META = {
  scam: { tone: "red", label: "Scam" },
  not_scam: { tone: "green", label: "Not scam" },
  unsure: { tone: "orange", label: "Not sure" },
  unchecked: { tone: "neutral", label: "Not checked" },
};

const SCAM_STATUS_META = {
  new_scam: { tone: "red", label: "New scam" },
  known_scam: { tone: "orange", label: "Known scam" },
};

const COLUMNS =
  "grid-cols-[52px_112px_136px_104px_132px_minmax(0,1fr)_230px_44px]";

const METER_TONE = {
  accent: "bg-accent",
  green: "bg-green",
  orange: "bg-orange",
  red: "bg-red",
  neutral: "bg-ink-3",
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

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/* ── meters and charts ─────────────────────────────────── */

function Meter({ label, value, max, tone = "accent", valueText, className = "" }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[12.5px] text-ink-2">{label}</span>
          <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular-nums">
            {valueText ?? value}
          </span>
        </div>
      )}
      <div
        role="meter"
        aria-label={label ?? "meter"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText ?? `${value} of ${max}`}
        className="h-1.5 overflow-hidden rounded-full bg-inset"
      >
        <div
          className={`h-full rounded-full ${METER_TONE[tone]} transition-[width] duration-300 ease-out motion-reduce:transition-none`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function SegmentedBar({ segments, total, height = "h-2", label }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex overflow-hidden rounded-full bg-inset ${height}`}
    >
      {segments.map(
        (segment) =>
          segment.value > 0 && (
            <div
              key={segment.key}
              className={`${METER_TONE[segment.tone]} transition-[width] duration-300 ease-out motion-reduce:transition-none`}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ),
      )}
    </div>
  );
}

function KpiCard({ label, value, caption, meterValue, meterMax, tone = "accent", valueText }) {
  return (
    <article className="flex flex-col rounded-card bg-surface p-4 shadow-card">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.09em] text-ink-3">{label}</p>
      <p className="mt-2 text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{caption}</p>
      <Meter
        className="mt-auto pt-4"
        value={meterValue}
        max={meterMax}
        tone={tone}
        valueText={valueText}
      />
    </article>
  );
}

function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-card bg-surface p-4 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActivityChart({ rows, now }) {
  const buckets = useMemo(() => {
    const size = 24;
    const slots = Array.from({ length: size }, (_, index) => ({
      key: index,
      scam: 0,
      not_scam: 0,
      unsure: 0,
      unchecked: 0,
      total: 0,
    }));
    for (const row of rows) {
      const stamp = Date.parse(row.received_at);
      if (Number.isNaN(stamp)) continue;
      const age = now - stamp;
      if (age < 0 || age >= size * 3_600_000) continue;
      const index = size - 1 - Math.floor(age / 3_600_000);
      const slot = slots[index];
      const key = row.status || "unchecked";
      if (slot[key] !== undefined) slot[key] += 1;
      slot.total += 1;
    }
    return slots;
  }, [rows, now]);

  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const segments = [
    { key: "scam", className: "bg-red", label: "Scam" },
    { key: "not_scam", className: "bg-green", label: "Not scam" },
    { key: "unsure", className: "bg-orange", label: "Not sure" },
    { key: "unchecked", className: "bg-ink-3", label: "Not checked" },
  ];

  return (
    <div className="mt-4">
      <div className="flex h-36 items-end gap-1">
        {buckets.map((bucket) => (
          <div
            key={bucket.key}
            className="group relative flex h-full flex-1 flex-col justify-end gap-px"
            title={`${bucket.total} checked — ${bucket.scam} scam, ${bucket.not_scam} not scam, ${bucket.unsure} not sure, ${bucket.unchecked} not checked`}
          >
            {bucket.total === 0 ? (
              <div className="h-0.5 rounded-full bg-line-strong" />
            ) : (
              segments.map(
                (segment) =>
                  bucket[segment.key] > 0 && (
                    <div
                      key={segment.key}
                      className={`${segment.className} transition-[height] duration-300 ease-out motion-reduce:transition-none`}
                      style={{ height: `${(bucket[segment.key] / max) * 100}%` }}
                    />
                  ),
              )
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-3 tabular-nums">
        {[24, 18, 12, 6, 0].map((hoursAgo) => (
          <span key={hoursAgo}>
            {hoursAgo === 0
              ? "now"
              : new Date(now - hoursAgo * 3_600_000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span className={`size-1.5 rounded-full ${segment.className}`} />
            {segment.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">24h</span>
      </div>
    </div>
  );
}

/* ── dashboard ─────────────────────────────────────────── */

export default function Dashboard() {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const stats = useMemo(() => {
    const counts = { scam: 0, not_scam: 0, unsure: 0, unchecked: 0 };
    const novelty = { new_scam: 0, known_scam: 0 };
    const clients = new Map();
    const models = new Map();
    for (const message of messages) {
      const key = message.status || "unchecked";
      if (counts[key] !== undefined) counts[key] += 1;
      if (message.scam_status === "new_scam") novelty.new_scam += 1;
      if (message.scam_status === "known_scam") novelty.known_scam += 1;
      const client = message.client || "(none)";
      clients.set(client, (clients.get(client) ?? 0) + 1);
      const model = message.model || "unknown";
      models.set(model, (models.get(model) ?? 0) + 1);
    }
    const total = messages.length;
    const scams = counts.scam;
    const repeats = novelty.new_scam + novelty.known_scam;
    return {
      total,
      counts,
      novelty,
      scams,
      repeats,
      newShare: pct(novelty.new_scam, repeats),
      scamRate: pct(scams, total),
      clients: [...clients.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      models: [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [messages]);

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

  const statusOptions = useMemo(
    () => [
      { key: "all", label: "All verdicts", count: messages.length },
      { key: "scam", label: "Scam", count: stats.counts.scam, dot: "var(--red)" },
      { key: "not_scam", label: "Not scam", count: stats.counts.not_scam, dot: "var(--green)" },
      { key: "unsure", label: "Not sure", count: stats.counts.unsure, dot: "var(--orange)" },
      ...(stats.counts.unchecked
        ? [{ key: "unchecked", label: "Not checked", count: stats.counts.unchecked, dot: "var(--ink-3)" }]
        : []),
    ],
    [messages.length, stats.counts],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((message) => {
      if (kindFilter !== "all" && (message.kind || "(none)") !== kindFilter) return false;
      if (statusFilter !== "all" && (message.status || "unchecked") !== statusFilter) return false;
      if (!needle) return true;
      return [message.text, message.url, message.client, message.kind, message.reply, ...(message.reasons ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [messages, query, kindFilter, statusFilter]);

  const initialLoading = status === "loading" && !updatedAt;
  const hasData = messages.length > 0;
  const chartNow = updatedAt ? updatedAt.getTime() : Date.now();
  const verdictSegments = [
    { key: "scam", label: "Scam", value: stats.counts.scam, tone: "red" },
    { key: "unsure", label: "Not sure", value: stats.counts.unsure, tone: "orange" },
    { key: "not_scam", label: "Not scam", value: stats.counts.not_scam, tone: "green" },
    { key: "unchecked", label: "Not checked", value: stats.counts.unchecked, tone: "neutral" },
  ];

  return (
    <>
      <Head>
        <title>Lantern Admin — scam operations</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-dvh overflow-x-clip">
        <div className="mx-auto flex min-h-dvh w-full max-w-[1320px] flex-col px-4 py-6 sm:px-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-ink text-[16px] font-semibold text-canvas">
                L
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[21px] leading-snug font-semibold tracking-[-0.02em] text-ink">
                    Lantern Admin
                  </h1>
                  <Chip tone="accent">ops</Chip>
                </div>
                <p className="mt-0.5 text-[12.5px] text-ink-2">
                  Scam operations over the latest {LIMIT} checks · refreshes every 5s
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={status === "error" ? "red" : status === "ok" ? "green" : "neutral"}>
                {status === "error" ? "Gateway unreachable" : status === "ok" ? "Live" : "Connecting"}
              </StatusPill>
              <a href="/console" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Ask the log
              </a>
              <Button variant="secondary" size="sm" onClick={() => load()} disabled={fetching}>
                {fetching ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </header>

          {status === "error" && (
            <div className="mt-4 rounded-control bg-red-tint px-3 py-2 text-[12.5px] text-red">
              Can&apos;t reach the gateway ({error}). Showing the last {messages.length} messages
              received — nothing is guessed or refreshed silently.
            </div>
          )}

          {initialLoading ? (
            <section className="mt-6 flex flex-1 items-start justify-center rounded-card bg-surface px-6 py-24 shadow-card">
              <LoadingState label="Loading messages" variant="Drive" />
            </section>
          ) : status === "error" && !hasData ? (
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
          ) : !hasData ? (
            <section className="mt-6 flex flex-1 flex-col items-center justify-center rounded-card bg-surface px-6 py-16 text-center shadow-card">
              <h2 className="text-[17px] font-semibold text-ink">No messages yet</h2>
              <p className="mt-1 text-[13px] text-ink-2">Send one from the extension, or try:</p>
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
            <>
              <section aria-label="Overview meters" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Checks"
                  value={stats.total}
                  caption={`Across ${stats.clients.length} client${stats.clients.length === 1 ? "" : "s"} in the latest window`}
                  meterValue={stats.total}
                  meterMax={stats.total}
                  tone="accent"
                  valueText="latest window"
                />
                <KpiCard
                  label="Scam rate"
                  value={`${stats.scamRate}%`}
                  caption={`${plural(stats.scams, "scam")} of ${stats.total} checks`}
                  meterValue={stats.counts.scam}
                  meterMax={stats.total}
                  tone="red"
                  valueText={`${stats.counts.scam} / ${stats.total}`}
                />
                <KpiCard
                  label="New scams"
                  value={stats.novelty.new_scam}
                  caption={
                    stats.repeats
                      ? `${stats.newShare}% of the ${plural(stats.repeats, "scam")} seen`
                      : "No scams in this window"
                  }
                  meterValue={stats.novelty.new_scam}
                  meterMax={Math.max(1, stats.repeats)}
                  tone="red"
                  valueText={`${stats.newShare}%`}
                />
                <KpiCard
                  label="Repeat scams"
                  value={stats.novelty.known_scam}
                  caption={
                    stats.repeats ? "Matched an earlier stored scam" : "None matched the stored log"
                  }
                  meterValue={stats.novelty.known_scam}
                  meterMax={Math.max(1, stats.repeats)}
                  tone="orange"
                  valueText={
                    stats.repeats
                      ? `${pct(stats.novelty.known_scam, stats.repeats)}%`
                      : "0%"
                  }
                />
              </section>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                <Panel
                  title="Volume, last 24 hours"
                  subtitle="Stacked by verdict, newest hour on the right"
                  action={<Chip>{plural(stats.total, "check")}</Chip>}
                >
                  <ActivityChart rows={messages} now={chartNow} />
                </Panel>

                <Panel
                  title="Scam novelty"
                  subtitle="New threats vs repeats we already logged"
                  action={stats.repeats ? <Chip tone="orange">{stats.repeats} tracked</Chip> : null}
                >
                  {stats.repeats > 0 ? (
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between">
                        <p className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                          {stats.newShare}%
                        </p>
                        <p className="text-[12px] text-ink-3">new</p>
                      </div>
                      <SegmentedBar
                        className="mt-3"
                        total={stats.repeats}
                        label={`${stats.novelty.new_scam} new scams, ${stats.novelty.known_scam} repeat scams`}
                        segments={[
                          { key: "new", label: "New scam", value: stats.novelty.new_scam, tone: "red" },
                          { key: "known", label: "Repeat scam", value: stats.novelty.known_scam, tone: "orange" },
                        ]}
                      />
                      <div className="mt-5 space-y-3">
                        <Meter
                          label="New scam"
                          value={stats.novelty.new_scam}
                          max={stats.repeats}
                          tone="red"
                          valueText={stats.novelty.new_scam}
                        />
                        <Meter
                          label="Repeat / known"
                          value={stats.novelty.known_scam}
                          max={stats.repeats}
                          tone="orange"
                          valueText={stats.novelty.known_scam}
                        />
                      </div>
                      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
                        A repeat is an exact match to a message already stored with a scam verdict.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-control bg-inset px-3 py-6 text-center text-[12.5px] text-ink-3">
                      No scams in this window. New and repeat meters will fill as checks arrive.
                    </p>
                  )}
                </Panel>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Panel title="Verdict mix" subtitle="Share of the latest window">
                  <div className="mt-4">
                    <SegmentedBar
                      total={stats.total}
                      label="Verdict distribution"
                      segments={verdictSegments.map((segment) => ({
                        ...segment,
                        label: STATUS_META[segment.key]?.label ?? segment.label,
                      }))}
                    />
                    <div className="mt-4 space-y-3">
                      {verdictSegments.map((segment) => (
                        <Meter
                          key={segment.key}
                          label={STATUS_META[segment.key]?.label ?? segment.label}
                          value={segment.value}
                          max={stats.total}
                          tone={segment.tone}
                          valueText={`${segment.value} · ${pct(segment.value, stats.total)}%`}
                        />
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Top clients"
                  subtitle="Who is sending checks"
                  action={<Chip>{stats.clients.length}</Chip>}
                >
                  <div className="mt-4 space-y-3">
                    {stats.clients.map(([client, count]) => (
                      <Meter
                        key={client}
                        label={client}
                        value={count}
                        max={Math.max(1, stats.clients[0]?.[1] ?? 1)}
                        tone="accent"
                        valueText={`${count} · ${pct(count, stats.total)}%`}
                      />
                    ))}
                  </div>
                </Panel>

                <Panel
                  title="Checker models"
                  subtitle="Mock vs live model answers"
                  action={<Chip>{stats.models.length}</Chip>}
                >
                  <div className="mt-4 space-y-3">
                    {stats.models.map(([model, count]) => (
                      <Meter
                        key={model}
                        label={model}
                        value={count}
                        max={Math.max(1, stats.models[0]?.[1] ?? 1)}
                        tone={model === "mock" ? "orange" : "green"}
                        valueText={`${count} · ${pct(count, stats.total)}%`}
                      />
                    ))}
                  </div>
                </Panel>
              </div>

              <section className="mt-6 min-w-0">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Message log</h2>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      Newest first ·{" "}
                      {updatedAt ? `updated ${updatedAt.toLocaleTimeString()}` : "waiting for the gateway"}
                    </p>
                  </div>
                  <p className="pr-1 font-mono text-[11.5px] text-ink-3 tabular-nums">
                    {visible.length} of {messages.length}
                  </p>
                </div>

                <div className="mt-3 rounded-card bg-surface p-3 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-full max-w-90">
                      <SearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="Search text, URL, client or reason…"
                        ariaLabel="Search messages"
                      />
                    </div>
                    <FilterChips options={kindOptions} active={kindFilter} onChange={setKindFilter} />
                  </div>
                  <div className="mt-1 border-t border-line pt-1">
                    <FilterChips
                      options={statusOptions}
                      active={statusFilter}
                      onChange={setStatusFilter}
                    />
                  </div>
                </div>

                <section
                  aria-label="Stored agent messages"
                  className="relative mt-3 w-full max-w-full min-w-0 overflow-x-auto rounded-card bg-surface shadow-card"
                  role="region"
                  tabIndex={0}
                  style={{ scrollbarWidth: "none" }}
                >
                  <div className="min-w-[1160px]">
                    <div
                      className={`grid ${COLUMNS} border-b border-[var(--grid-line)] bg-inset/40 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3`}
                    >
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Id</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Received</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Client</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Kind</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Verdict</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">Text</span>
                      <span className="border-r border-[var(--grid-line)] px-3 py-2.5">URL</span>
                      <span className="px-3 py-2.5">
                        <span className="sr-only">Payload</span>
                      </span>
                    </div>

                    {visible.length === 0 && (
                      <div className="px-4 py-14 text-center">
                        <p className="text-[13px] font-medium text-ink">No matches</p>
                        <p className="mt-1 text-[12px] text-ink-3">Adjust the search or filters.</p>
                      </div>
                    )}

                    {visible.map((message) => {
                      const meta = kindMeta(message.kind);
                      const statusInfo = STATUS_META[message.status || "unchecked"];
                      const scamStatusInfo = SCAM_STATUS_META[message.scam_status];
                      const expanded = expandedId === message.id;
                      const payloadText = JSON.stringify(message.payload ?? {}, null, 2);
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
                            <span className="flex min-w-0 flex-col items-start justify-center gap-0.5 border-r border-[var(--grid-line)] px-3 py-2">
                              <StatusPill tone={statusInfo.tone}>{statusInfo.label}</StatusPill>
                              {scamStatusInfo && (
                                <span className="text-[10.5px] font-medium text-ink-3">
                                  {scamStatusInfo.label}
                                </span>
                              )}
                            </span>
                            <span className="flex min-w-0 flex-col justify-center gap-0.5 border-r border-[var(--grid-line)] px-3 py-2">
                              <span className="min-w-0 truncate text-ink" title={message.text || undefined}>
                                {message.text || <span className="text-ink-3">—</span>}
                              </span>
                              {message.reply && (
                                <span className="min-w-0 truncate text-[12px] text-ink-3" title={message.reply}>
                                  {message.reply}
                                </span>
                              )}
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
                              {(message.status || message.reply) && (
                                <div className="mb-2 rounded-card bg-surface p-3 shadow-hairline">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {statusInfo ? (
                                      <StatusPill tone={statusInfo.tone}>{statusInfo.label}</StatusPill>
                                    ) : (
                                      <StatusPill tone="neutral">No verdict</StatusPill>
                                    )}
                                    {scamStatusInfo && (
                                      <StatusPill tone={scamStatusInfo.tone}>
                                        {scamStatusInfo.label}
                                      </StatusPill>
                                    )}
                                    {message.model && <Chip>{message.model}</Chip>}
                                  </div>
                                  {message.reply && (
                                    <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                                      {message.reply}
                                    </p>
                                  )}
                                  {message.scam_note && (
                                    <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                                      {message.scam_note}
                                    </p>
                                  )}
                                  {(message.reasons ?? []).length > 0 && (
                                    <ul className="mt-2 flex flex-wrap gap-1.5">
                                      {message.reasons.map((reason) => (
                                        <li key={reason}>
                                          <Chip tone="orange">{reason}</Chip>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
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
              </section>
            </>
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
