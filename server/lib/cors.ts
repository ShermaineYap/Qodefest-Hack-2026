// CORS allowlist: any Chrome extension origin, localhost, our Vercel preview
// and production domains. Origin is reflected, never wildcarded, and
// credentials are never allowed.

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (/^chrome-extension:\/\/[a-z]{32}$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) return true;

  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

export interface CorsDecision {
  /** false only when an Origin was sent and it is not allowed. */
  ok: boolean;
  origin: string | null;
}

export function corsDecision(origin: string | null | undefined): CorsDecision {
  if (!origin) return { ok: true, origin: null };
  const ok = isAllowedOrigin(origin);
  // A denied origin must never be reflected: no ACAO header at all.
  return { ok, origin: ok ? origin : null };
}

export const CORS_METHODS = "POST, OPTIONS";
export const CORS_HEADERS = "content-type";
export const CORS_MAX_AGE = "600";

/** Apply headers to any response. Call before writing the status. */
export function applyCorsHeaders(
  headers: { setHeader(name: string, value: string): void },
  origin: string | null,
): void {
  headers.setHeader("Vary", "Origin");
  if (origin) {
    headers.setHeader("Access-Control-Allow-Origin", origin);
    headers.setHeader("Access-Control-Allow-Methods", CORS_METHODS);
    headers.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
    headers.setHeader("Access-Control-Max-Age", CORS_MAX_AGE);
  }
}
