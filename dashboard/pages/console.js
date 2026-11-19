import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";

import CodeBlock from "@/components/beautiful-ui/CodeBlock";
import LoadingState from "@/components/beautiful-ui/LoadingState";
import { Button, buttonVariants } from "@/components/beautiful-ui/Button";
import { Chip } from "@/components/beautiful-ui/Chip";
import { StatusPill } from "@/components/beautiful-ui/StatusPill";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_BASE ?? "";
const MAX_RENDERED_ROWS = 20;

const SUGGESTIONS = [
  "What happened today?",
  "How many scams this week?",
  "Which clients send the most messages?",
  "Show the latest known scams",
  "What did people ask yesterday?",
];

function adminError(status) {
  if (status === 422) return "The gateway rejected that question. Keep it under 500 characters.";
  return `The gateway answered ${status}. Nothing was invented; try again.`;
}

function cellText(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function ResultTable({ columns, rows }) {
  if (!rows.length || !columns.length) return null;
  const shown = rows.slice(0, MAX_RENDERED_ROWS);
  return (
    <div className="mt-3">
      <div className="overflow-x-auto rounded-control shadow-hairline">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-inset/60 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
              {columns.map((column) => (
                <th key={column} scope="col" className="border-b border-line px-3 py-2 whitespace-nowrap">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index} className="border-b border-[var(--grid-line)] last:border-0">
                {columns.map((column) => {
                  const value = cellText(row[column]);
                  return (
                    <td key={column} className="px-3 py-2 align-top text-[13px] text-ink">
                      <span className="block max-w-[320px] truncate font-mono text-[12.5px]" title={value}>
                        {value}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3 tabular-nums">
        Showing {shown.length} of {rows.length} returned row{rows.length === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

function Answer({ turn }) {
  if (turn.loading) {
    return (
      <article className="rounded-card bg-surface p-4 shadow-card">
        <LoadingState label="Querying the log" variant="Drive" />
      </article>
    );
  }

  if (turn.error) {
    return (
      <article className="rounded-card bg-surface p-4 shadow-card">
        <StatusPill tone="red">Not answered</StatusPill>
        <p className="mt-3 text-[16px] leading-relaxed text-red">{turn.error}</p>
      </article>
    );
  }

  return (
    <article className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="accent">Lantern</StatusPill>
        <Chip>{turn.source === "model" ? "model" : "summary"}</Chip>
        <Chip>{turn.row_count} row{turn.row_count === 1 ? "" : "s"}</Chip>
        <Chip>{turn.took_ms} ms</Chip>
        {turn.truncated && <StatusPill tone="orange">Capped at 200 rows</StatusPill>}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-ink">{turn.answer}</p>
      {turn.note && <p className="mt-2 text-[13px] leading-relaxed text-ink-3">{turn.note}</p>}

      {turn.sql && (
        <details className="mt-3">
          <summary className="w-fit cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">
            Show the query that ran
          </summary>
          <div className="mt-2">
            <CodeBlock
              filename="query.sql"
              lines={turn.sql.split("\n")}
              code={turn.sql}
              className="max-w-none"
            />
          </div>
        </details>
      )}

      <ResultTable columns={turn.columns ?? []} rows={turn.rows ?? []} />
    </article>
  );
}

export default function Console() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const send = useCallback(
    async (raw) => {
      const text = String(raw ?? question).trim();
      if (!text || busy) return;

      const history = [];
      for (const turn of turns) {
        if (turn.role === "user") history.push({ role: "user", content: turn.content });
        else if (turn.role === "assistant" && turn.answer) {
          history.push({ role: "assistant", content: turn.answer });
        }
      }

      const id = `${Date.now()}-a`;
      setTurns((prev) => [
        ...prev,
        { id: `${Date.now()}-u`, role: "user", content: text },
        { id, role: "assistant", loading: true },
      ]);
      setQuestion("");
      setBusy(true);

      try {
        const response = await fetch(`${API_BASE}/agent/admin/chat`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, history: history.slice(-6) }),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(adminError(response.status));
        }
        setTurns((prev) =>
          prev.map((turn) => (turn.id === id ? { id, role: "assistant", ...body } : turn)),
        );
      } catch (error) {
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === id
              ? {
                  id,
                  role: "assistant",
                  error:
                    error instanceof TypeError
                      ? "Can't reach the gateway. Check that it is running, then try again."
                      : error.message,
                }
              : turn,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, question, turns],
  );

  const onSubmit = (event) => {
    event.preventDefault();
    send(question);
  };

  return (
    <>
      <Head>
        <title>Lantern — admin console</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh w-full max-w-[1000px] flex-col px-4 py-7 sm:px-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-ink text-[15px] font-semibold text-canvas">
                L
              </span>
              <div>
                <h1 className="text-[21px] leading-snug font-semibold tracking-[-0.02em] text-ink">
                  Lantern admin
                </h1>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  Ask the scan log in plain words. Read-only: answers come from the stored
                  messages and the query is shown.
                </p>
              </div>
            </div>

            <a href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Back to the log
            </a>
          </header>

          <section aria-live="polite" className="mt-5 flex flex-1 flex-col gap-4">
            {turns.length === 0 ? (
              <div className="rounded-card bg-surface p-6 shadow-card">
                <h2 className="text-[17px] font-semibold text-ink">Ask what the log saw</h2>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                  Every checked message is stored with its verdict, reasons, client and time. Ask
                  about a day, a status or a client. You can follow up on the answer.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => send(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-card bg-accent-tint px-4 py-3 text-[16px] leading-relaxed text-accent-ink">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <Answer key={turn.id} turn={turn} />
                ),
              )
            )}
            <div ref={endRef} />
          </section>

          <form onSubmit={onSubmit} className="sticky bottom-0 mt-5 pb-2 pt-3" style={{ background: "var(--canvas)" }}>
            <div className="flex items-end gap-2 rounded-card bg-surface p-2 shadow-card">
              <label htmlFor="admin-question" className="sr-only">
                Ask the scan log
              </label>
              <input
                id="admin-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What happened today?"
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[16px] text-ink outline-none placeholder:text-ink-3"
              />
              <Button type="submit" variant="primary" size="md" disabled={busy || !question.trim()}>
                {busy ? "Asking" : "Ask"}
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[12px] text-ink-3">
              Answers use the stored rows only. Times are UTC.
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
