import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import CodeBlock from "@/components/beautiful-ui/CodeBlock";
import LoadingState from "@/components/beautiful-ui/LoadingState";
import { Button, buttonVariants } from "@/components/beautiful-ui/Button";
import { Chip } from "@/components/beautiful-ui/Chip";
import { StatusPill } from "@/components/beautiful-ui/StatusPill";

const markdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="text-[20px] leading-snug font-semibold tracking-[-0.02em] text-ink" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mt-7 border-t border-line pt-5 text-[17px] font-semibold text-ink" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-5 text-[15.5px] font-semibold text-ink" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mt-3 text-[16px] leading-relaxed text-ink-2" {...props} />
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-ink" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-ink-3" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 marker:text-ink-3" {...props} />
  ),
  li: ({ node, ...props }) => (
    <li className="text-[15px] leading-relaxed text-ink-2" {...props} />
  ),
  code: ({ node, ...props }) => (
    <code className="font-mono text-[13.5px] text-ink" {...props} />
  ),
  pre: ({ node, ...props }) => (
    <pre
      className="mt-3 overflow-x-auto rounded-control bg-inset p-3 font-mono text-[13px] leading-relaxed text-ink"
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a className="text-accent-ink underline underline-offset-2" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="mt-3 overflow-x-auto rounded-control shadow-hairline">
      <table className="w-full border-collapse text-left" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th
      className="border-b border-line bg-inset/60 px-3 py-2 text-[11.5px] font-medium tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase"
      {...props}
    />
  ),
  td: ({ node, ...props }) => (
    <td className="border-b border-[var(--grid-line)] px-3 py-2 align-top text-[14px] text-ink" {...props} />
  ),
  hr: () => <hr className="mt-6 border-line" />,
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [listStatus, setListStatus] = useState("loading");
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState(null);
  const [reportStatus, setReportStatus] = useState("idle");
  const [reportError, setReportError] = useState("");
  const [nonce, setNonce] = useState(0);

  const loadList = useCallback(async (signal) => {
    setListStatus("loading");
    try {
      const res = await fetch("/api/reports", { cache: "no-store", signal });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      const data = await res.json();
      if (signal?.aborted) return;
      const next = Array.isArray(data.reports) ? data.reports : [];
      setReports(next);
      setListStatus("ok");
      setListError("");
      setSelected((current) => {
        if (current && next.some((item) => item.date === current)) return current;
        const requested = new URLSearchParams(window.location.search).get("date");
        if (requested && next.some((item) => item.date === requested)) return requested;
        return next[0]?.date ?? null;
      });
    } catch (err) {
      if (signal?.aborted) return;
      setListStatus("error");
      setListError(err instanceof Error ? err.message : "request failed");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList, nonce]);

  useEffect(() => {
    if (!selected) {
      setReport(null);
      setReportStatus("idle");
      return undefined;
    }
    const controller = new AbortController();
    setReportStatus("loading");
    fetch(`/api/reports/${selected}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `server answered ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setReport(data);
        setReportStatus("ok");
        setReportError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setReportStatus("error");
        setReportError(err instanceof Error ? err.message : "request failed");
      });
    return () => controller.abort();
  }, [selected, nonce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", selected ? `/reports?date=${selected}` : "/reports");
  }, [selected]);

  const selectedMeta = useMemo(
    () => reports.find((item) => item.date === selected) ?? null,
    [reports, selected],
  );

  return (
    <>
      <Head>
        <title>Lantern — daily reports</title>
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
                  Daily scam reports — written from the message log by the Qoder agent. Read-only.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <StatusPill tone={listStatus === "error" ? "red" : listStatus === "ok" ? "green" : "neutral"}>
                {listStatus === "error" ? "Reports unreachable" : listStatus === "ok" ? "Reports ok" : "Loading"}
              </StatusPill>
              <a href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                Message log
              </a>
              <Button variant="secondary" size="sm" onClick={() => setNonce((value) => value + 1)}>
                Refresh
              </Button>
            </div>
          </header>

          {listStatus === "error" && (
            <div className="mt-4 rounded-control bg-red-tint px-3 py-2 text-[12.5px] text-red">
              Can&apos;t load the report list ({listError}). Nothing is guessed or filled in.
            </div>
          )}

          {listStatus === "loading" && reports.length === 0 ? (
            <section className="mt-6 flex flex-1 items-start justify-center rounded-card bg-surface px-6 py-24 shadow-card">
              <LoadingState label="Loading reports" variant="Drive" />
            </section>
          ) : reports.length === 0 ? (
            <section className="mt-6 flex flex-1 flex-col items-center justify-center rounded-card bg-surface px-6 py-16 text-center shadow-card">
              <StatusPill tone="neutral">No reports yet</StatusPill>
              <h2 className="mt-4 text-[17px] font-semibold text-ink">
                {listStatus === "error" ? "Nothing to show" : "The daily job has not run"}
              </h2>
              <p className="mt-1 max-w-100 text-[13px] text-ink-2">
                {listStatus === "error"
                  ? "The report list could not be loaded. This page never shows invented content."
                  : "Reports appear here after 23:30 Malaysia time, or when someone triggers one:"}
              </p>
              {listStatus !== "error" && (
                <div className="mt-4 w-full max-w-130 text-left">
                  <CodeBlock
                    filename="terminal"
                    className="max-w-none"
                    lines={["/srv/repo/server/reports/run-report.sh"]}
                  />
                </div>
              )}
              {listStatus === "error" && (
                <Button variant="secondary" size="sm" className="mt-5" onClick={() => setNonce((value) => value + 1)}>
                  Try again
                </Button>
              )}
            </section>
          ) : (
            <>
              <section className="mt-6 rounded-card bg-surface p-3 shadow-card">
                <div className="flex flex-wrap items-center gap-1.5">
                  {reports.map((item) => {
                    const active = item.date === selected;
                    return (
                      <button
                        key={item.date}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelected(item.date)}
                        className={`flex h-8 items-center rounded-full px-3 text-[13px] font-medium tabular-nums transition-[background-color,box-shadow,color] duration-200 ${
                          active ? "bg-inset text-ink shadow-btn" : "text-ink-2 hover:bg-hover"
                        }`}
                      >
                        {item.date}
                      </button>
                    );
                  })}
                  <span className="ml-auto pr-1 text-[12px] text-ink-3 tabular-nums">
                    {reports.length} report{reports.length === 1 ? "" : "s"}
                  </span>
                </div>
              </section>

              <section className="mt-4 flex flex-1 flex-col">
                {reportStatus === "error" ? (
                  <article className="rounded-card bg-surface p-5 shadow-card">
                    <StatusPill tone="red">Not available</StatusPill>
                    <p className="mt-3 text-[13px] leading-relaxed text-red">
                      Could not load the report for {selected} ({reportError}).
                    </p>
                  </article>
                ) : reportStatus === "loading" || !report ? (
                  <article className="rounded-card bg-surface p-5 shadow-card">
                    <LoadingState label="Loading report" variant="Drive" />
                  </article>
                ) : (
                  <article className="rounded-card bg-surface p-5 shadow-card sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="accent">Daily report</StatusPill>
                      <Chip>{report.date}</Chip>
                      {selectedMeta && <Chip>{formatBytes(selectedMeta.bytes)}</Chip>}
                      {selectedMeta && (
                        <span className="text-[12px] text-ink-3">
                          Updated {formatUpdated(selectedMeta.modified_at)}
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {report.markdown ?? ""}
                      </ReactMarkdown>
                    </div>

                    <details className="mt-6 border-t border-line pt-4">
                      <summary className="w-fit cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">
                        Show Markdown source
                      </summary>
                      <div className="mt-3">
                        <CodeBlock
                          filename={`${report.date}.md`}
                          lines={String(report.markdown ?? "").split("\n")}
                          code={String(report.markdown ?? "")}
                          className="max-w-none"
                        />
                      </div>
                    </details>
                  </article>
                )}
              </section>
            </>
          )}

          <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-6 text-[11.5px] text-ink-3">
            <p>
              Generated by <code className="font-mono">server/reports/run-report.sh</code> · stored on the
              server at <code className="font-mono">/srv/reports</code>
            </p>
            <p>
              Sources: <code className="font-mono">GET /api/reports</code> ·{" "}
              <code className="font-mono">GET /api/reports/&lt;date&gt;</code>
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
