// Vercel function: POST /api/agent/chat. The panel is served from the same
// project (outputDirectory: panel), so the demo URL is the deployment root.

import { applyCorsHeaders, corsDecision } from "../../server/lib/cors.ts";
import { parseChatRequest } from "../../server/agent/contract.ts";
import { ApiHttpError, runChat } from "../../server/agent/loop.ts";

interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string };
}

interface VercelResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function send(res: VercelResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function header(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = header(req.headers.origin);
  const decision = corsDecision(origin);
  applyCorsHeaders(res, decision.origin);

  if (!decision.ok) {
    send(res, 403, { error: { code: "ORIGIN_DENIED", message: "origin not allowed" } });
    return;
  }
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: { code: "METHOD", message: "POST only" } });
    return;
  }

  // Vercel parses JSON bodies; Vercel's local emulator may hand us a string.
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      send(res, 400, { error: { code: "BAD_JSON", message: "body must be JSON" } });
      return;
    }
  }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    send(res, 400, { error: { code: parsed.code, message: parsed.message } });
    return;
  }

  try {
    const result = await runChat(parsed.value, {
      allowOrigin: process.env.PUBLIC_ORIGIN ?? null,
    });
    send(res, 200, result);
  } catch (error) {
    if (error instanceof ApiHttpError) {
      send(res, error.status, { error: { code: error.code, message: error.message } });
      return;
    }
    console.error("agent failed", error instanceof Error ? error.message : error);
    send(res, 500, { error: { code: "INTERNAL", message: "checker failed" } });
  }
}
