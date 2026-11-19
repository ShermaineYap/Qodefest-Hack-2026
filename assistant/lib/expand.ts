import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parseUrl } from "./rules.ts";

/**
 * expand_url: follow up to 5 redirects with HEAD requests. No cookies, no referrer, 3 s total.
 * SSRF guard: refuses private, loopback and link-local addresses at every hop.
 */
function isPrivate(ip: string): boolean {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || (ip.startsWith("::ffff:") && isPrivate(ip.slice(7)));
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function safeHost(host: string) {
  if (isIP(host)) return !isPrivate(host);
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const addrs = await lookup(host, { all: true });
  return addrs.length > 0 && addrs.every((a) => !isPrivate(a.address));
}

export async function expandUrl(raw: string, budgetMs = 3000): Promise<{ finalUrl: string; hops: number; error?: string }> {
  const deadline = Date.now() + budgetMs;
  let current = parseUrl(raw);
  if (!current) return { finalUrl: raw, hops: 0, error: "not a link" };
  for (let hop = 0; hop < 5; hop++) {
    if (!(await safeHost(current.hostname))) return { finalUrl: current.href, hops: hop, error: "blocked address" };
    const left = deadline - Date.now();
    if (left <= 0) return { finalUrl: current.href, hops: hop, error: "timeout" };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), left);
    try {
      const r = await fetch(current.href, { method: "HEAD", redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Lantern-link-check/1.0" }, referrerPolicy: "no-referrer", credentials: "omit" });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = parseUrl(new URL(loc, current.href).href);
        if (!next) return { finalUrl: current.href, hops: hop + 1, error: "bad redirect" };
        current = next;
        continue;
      }
      return { finalUrl: current.href, hops: hop };
    } catch (e) {
      return { finalUrl: current.href, hops: hop, error: e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable" };
    } finally {
      clearTimeout(t);
    }
  }
  return { finalUrl: current.href, hops: 5, error: "too many redirects" };
}
