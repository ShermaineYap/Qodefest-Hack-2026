import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// CORS allowlist: the extension, local development, and this deployment (same origin needs no header).
function allowedOrigin(origin: string | null) {
  if (!origin) return null;
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (extra.includes(origin)) return origin;
  return null;
}

function cors(req: Request) {
  const o = allowedOrigin(req.headers.get("origin"));
  const h: Record<string, string> = { Vary: "Origin" };
  if (o) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return { headers: h, allowed: !!o || !req.headers.get("origin") };
}

export async function OPTIONS(req: Request) {
  const { headers, allowed } = cors(req);
  return new NextResponse(null, { status: allowed ? 204 : 403, headers });
}

export async function POST(req: Request) {
  const { headers } = cors(req);
  if (process.env.ASSISTANT_DISABLED === "1") {
    return NextResponse.json({ error: "disabled" }, { status: 503, headers });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.message !== "string") {
    return NextResponse.json({ error: "message (string) is required" }, { status: 400, headers });
  }
  const out = await runAgent({
    message: body.message,
    pageUrl: typeof body.pageUrl === "string" ? body.pageUrl : undefined,
    lang: body.lang === "ms" ? "ms" : "en",
  });
  return NextResponse.json(out, { headers: { ...headers, "Cache-Control": "no-store" } });
}
