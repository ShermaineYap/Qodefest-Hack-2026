// URL handling: parse, normalise, and show only what scoring needs.
// Query strings and fragments never reach the model, the logs or the response.

import rules from "../../shared/url-rules.json" with { type: "json" };
import { isIpLiteral, isPrivateHost } from "./ssrf.ts";

const MULTI_PART_SUFFIXES = new Set([
  "com.my",
  "net.my",
  "org.my",
  "gov.my",
  "edu.my",
  "co.uk",
  "org.uk",
  "com.sg",
  "com.au",
  "co.id",
  "co.th",
  "com.ph",
  "com.vn",
  "com.br",
  "co.jp",
  "co.kr",
  "com.hk",
  "com.tw",
  "co.in",
  "com.cn",
]);

export interface UrlFacts {
  raw: string;
  scheme: string;
  host: string;
  registrable: string;
  tld: string;
  labels: string[];
  subdomainCount: number;
  path: string;
  pathShape: string;
  hasUserinfo: boolean;
  ipLiteral: boolean;
  punycode: boolean;
  mixedScript: boolean;
  privateHost: boolean;
  assumesScheme: boolean;
}

export interface ExtractedUrl {
  url: string;
  assumesScheme: boolean;
}

const EXPLICIT_URL = /https?:\/\/[^\s<>"'`)\]]+/i;
// A bare domain, optionally with a path. The leading boundary avoids emails.
const BARE_URL =
  /(?:^|[\s("'[])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})((?:\/[^\s<>"'`)\]]*)?)/i;

function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

export function extractFirstUrl(text: string): ExtractedUrl | null {
  if (!text) return null;
  const explicit = text.match(EXPLICIT_URL);
  if (explicit) {
    return { url: trimTrailing(explicit[0]), assumesScheme: false };
  }
  const bare = text.match(BARE_URL);
  if (!bare) return null;
  const candidate = trimTrailing(`${bare[1]}${bare[2] ?? ""}`);
  if (candidate.includes("@")) return null;
  return { url: `https://${candidate}`, assumesScheme: true };
}

export function stripQuery(url: URL): string {
  const copy = new URL(url.toString());
  copy.search = "";
  copy.hash = "";
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

/** The only URL shape allowed out of this process. */
export function displayUrl(facts: UrlFacts): string {
  const scheme = facts.scheme === "http:" ? "http://" : "";
  const path = facts.pathShape && facts.pathShape !== "/" ? facts.pathShape : "";
  return `${scheme}${facts.host}${path}`;
}

export function registrableDomain(host: string): string {
  const clean = host.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(clean)) return clean;
  const labels = clean.split(".");
  if (labels.length <= 2) return clean;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

export function tldOf(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  return labels[labels.length - 1] ?? "";
}

function hasMixedScript(host: string): boolean {
  const hasAscii = /[a-z]/i.test(host);
  const hasNonAscii = /[^\x00-\x7F]/.test(host);
  return hasAscii && hasNonAscii;
}

function pathShapeOf(pathname: string): string {
  const lower = pathname.toLowerCase();
  for (const shape of rules.credentialPaths) {
    if (lower === shape || lower.startsWith(`${shape}/`)) return shape;
  }
  return pathname === "" || pathname === "/" ? "/" : ":path";
}

export function parseUrl(extracted: ExtractedUrl): UrlFacts | null {
  let parsed: URL;
  try {
    parsed = new URL(extracted.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();
  const labels = host.split(".");
  const subdomainCount = Math.max(0, labels.length - registrableDomain(host).split(".").length);
  const path = parsed.pathname.replace(/\/+$/, "") || "/";

  return {
    raw: stripQuery(parsed),
    scheme: parsed.protocol,
    host,
    registrable: registrableDomain(host),
    tld: tldOf(host),
    labels,
    subdomainCount,
    path,
    pathShape: pathShapeOf(path),
    hasUserinfo: Boolean(parsed.username || parsed.password),
    ipLiteral: isIpLiteral(host),
    punycode: host.includes("xn--"),
    mixedScript: hasMixedScript(host),
    privateHost: isPrivateHost(host),
    assumesScheme: extracted.assumesScheme,
  };
}

/** Split a host into brand-ish tokens: maybank-secure-login -> [maybank, secure, login]. */
export function hostTokens(host: string): string[] {
  return host
    .toLowerCase()
    .split(/[-._]/)
    .filter(Boolean);
}

export function matchesHost(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}
