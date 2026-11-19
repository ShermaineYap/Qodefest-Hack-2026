// Address guards for expand_url. The checker never fetches a page body: it only
// follows redirect headers, and it refuses anything that is not a public host.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

export function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") && host.includes("]")) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) {
    return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  }
  return false;
}

/** Only http(s), no credentials, no private hosts, no exotic ports. */
export function assertFetchable(
  url: URL,
  allowOrigin: string | null,
): { ok: true } | { ok: false; code: "SSRF_BLOCKED" } {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, code: "SSRF_BLOCKED" };
  }
  if (url.username || url.password) return { ok: false, code: "SSRF_BLOCKED" };
  if (allowOrigin && originOf(url) === allowOrigin) return { ok: true };
  if (isPrivateHost(url.hostname)) return { ok: false, code: "SSRF_BLOCKED" };
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, code: "SSRF_BLOCKED" };
  }
  return { ok: true };
}

export function originOf(url: URL): string {
  return `${url.protocol}//${url.host}`;
}
