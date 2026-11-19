// Local server: the API plus the standalone panel, one origin, zero build.
//   node server/index.ts  ->  http://localhost:8787

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCorsHeaders, corsDecision } from "./lib/cors.ts";
import { parseChatRequest, type ApiError } from "./agent/contract.ts";
import { ApiHttpError, runChat } from "./agent/loop.ts";
import { qwenConfigured, qwenModelName } from "./agent/qwen.ts";

const PORT = Number(process.env.PORT ?? 8787);
const PANEL_DIR = fileURLToPath(new URL("../panel/", import.meta.url));
const MAX_BODY = 8 * 1024;

const DEMO_REDIRECTS: Record<string, string> = {
  "/r/phish": "https://maybank-secure-login.xyz/login",
  "/r/legit": "https://www.maybank2u.com.my/",
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

// Rate limits are per process and reset on deploy: this is a demo, not a durable
// quota. The limits exist so one script cannot hammer the model.
const sessionHits = new Map<string, number[]>();
const ipHits = new Map<string, number[]>();

function limited(map: Map<string, number[]>, key: string, max: number): boolean {
  const now = Date.now();
  const recent = (map.get(key) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  map.set(key, recent);
  return recent.length > max;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiHttpError(413, "TOO_LARGE", "body is larger than 8 KB"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function servePanel(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const target = normalize(join(PANEL_DIR, pathname));
  if (!target.startsWith(normalize(PANEL_DIR))) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  try {
    const file = await readFile(target);
    res.statusCode = 200;
    res.setHeader("content-type", MIME[extname(target)] ?? "application/octet-stream");
    res.setHeader("cache-control", "no-cache");
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

const server = createServer((req, res) => {
  void handle(req, res).catch((error: unknown) => {
    if (res.headersSent) return;
    if (error instanceof ApiHttpError) {
      json(res, error.status, { error: { code: error.code, message: error.message } });
      return;
    }
    console.error("unhandled", error instanceof Error ? error.message : error);
    json(res, 500, { error: { code: "INTERNAL", message: "checker failed" } });
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const originHeader = req.headers.origin ?? null;
  const decision = corsDecision(originHeader);
  applyCorsHeaders(res, decision.origin);

  if (!decision.ok) {
    json(res, 403, { error: { code: "ORIGIN_DENIED", message: "origin not allowed" } });
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url.pathname === "/healthz") {
    json(res, 200, {
      ok: true,
      mode: qwenConfigured() ? "model" : "mock",
      model: qwenConfigured() ? qwenModelName() : null,
      policyId: "shou-v1",
    });
    return;
  }

  const redirect = DEMO_REDIRECTS[url.pathname];
  if (redirect && (req.method === "GET" || req.method === "HEAD")) {
    res.statusCode = 302;
    res.setHeader("location", redirect);
    res.setHeader("cache-control", "no-store");
    res.end();
    return;
  }

  if (url.pathname === "/api/agent/chat") {
    if (req.method !== "POST") {
      json(res, 405, { error: { code: "METHOD", message: "POST only" } });
      return;
    }
    const ip = req.socket.remoteAddress ?? "unknown";
    let bodyText: string;
    try {
      bodyText = await readBody(req);
    } catch (error) {
      if (error instanceof ApiHttpError) {
        json(res, error.status, { error: { code: error.code, message: error.message } } as ApiError);
        return;
      }
      throw error;
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      json(res, 400, { error: { code: "BAD_JSON", message: "body must be JSON" } });
      return;
    }
    const parsed = parseChatRequest(body);
    if (!parsed.ok) {
      json(res, parsed.code === "NO_INPUT" ? 400 : 400, {
        error: { code: parsed.code, message: parsed.message },
      });
      return;
    }
    if (limited(sessionHits, parsed.value.sessionId, 10) || limited(ipHits, ip, 60)) {
      json(res, 429, { error: { code: "RATE_LIMITED", message: "too many checks, wait a minute" } });
      return;
    }
    const publicOrigin = `http://localhost:${PORT}`;
    const result = await runChat(parsed.value, { allowOrigin: publicOrigin });
    json(res, 200, result);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await servePanel(req, res, url);
    return;
  }

  json(res, 404, { error: { code: "NOT_FOUND", message: "no such route" } });
}

server.listen(PORT, () => {
  console.log(`Ask SHOU on http://localhost:${PORT}`);
  console.log(`model mode: ${qwenConfigured() ? qwenModelName() : "mock (no QWEN_API_KEY)"}`);
});
