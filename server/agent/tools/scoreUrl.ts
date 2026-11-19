// Deterministic URL rules with hard floors. This layer always runs, is
// explainable, and is the reason an obvious phish is still caught when the
// model times out.

import rules from "../../../shared/url-rules.json" with { type: "json" };
import type { Signal, UrlScoreResult } from "../contract.ts";
import {
  displayUrl,
  extractFirstUrl,
  hostTokens,
  matchesHost,
  parseUrl,
  type UrlFacts,
} from "../../lib/url.ts";
import { tierFor } from "../verdict.ts";

const BRAND_DISPLAY: Record<string, string> = {
  maybank: "Maybank",
  maybank2u: "Maybank2u",
  cimb: "CIMB",
  cimbclicks: "CIMB Clicks",
  publicbank: "Public Bank",
  pbebank: "PBeBank",
  rhb: "RHB",
  hongleong: "Hong Leong",
  hlb: "Hong Leong",
  ambank: "AmBank",
  bsn: "BSN",
  bimb: "Bank Islam",
  bankislam: "Bank Islam",
  touchngo: "Touch 'n Go",
  tng: "Touch 'n Go",
  shopee: "Shopee",
  lazada: "Lazada",
  grab: "Grab",
  poslaju: "PosLaju",
  jnt: "J&T",
  dhl: "DHL",
  fedex: "FedEx",
  lhdn: "LHDN",
  hasil: "LHDN",
  pdrm: "PDRM",
  rmp: "PDRM",
  kwsp: "KWSP",
  myeg: "MyEG",
  tnb: "TNB",
  maxis: "Maxis",
  celcom: "Celcom",
  digi: "Digi",
  unifi: "Unifi",
  google: "Google",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  apple: "Apple",
  icloud: "iCloud",
  microsoft: "Microsoft",
  netflix: "Netflix",
  amazon: "Amazon",
  tiktok: "TikTok",
  asnb: "ASNB",
  sspn: "SSPN",
};

export function brandHits(facts: UrlFacts): Array<{ brand: string; official: string }> {
  const tokens = hostTokens(facts.host);
  const hits: Array<{ brand: string; official: string }> = [];
  for (const [brand, officialDomains] of Object.entries(rules.brands)) {
    const official = officialDomains[0];
    if (!official) continue;
    // A host that sits under ANY of the brand's official domains is not a lookalike.
    if (officialDomains.some((domain) => matchesHost(facts.host, domain))) continue;
    const isHit = tokens.some(
      (token) => token === brand || (brand.length >= 4 && token.startsWith(brand)),
    );
    if (isHit) hits.push({ brand, official });
  }
  // de-dupe by official domain, keep the longest (most specific) brand name
  const byOfficial = new Map<string, { brand: string; official: string }>();
  for (const hit of hits) {
    const current = byOfficial.get(hit.official);
    if (!current || hit.brand.length > current.brand.length) byOfficial.set(hit.official, hit);
  }
  return [...byOfficial.values()];
}

function isKnownBrandDomain(facts: UrlFacts): string | null {
  for (const officialDomains of Object.values(rules.brands)) {
    for (const official of officialDomains) {
      if (matchesHost(facts.host, official)) return official;
    }
  }
  return null;
}

function hasOpenRedirect(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    for (const key of rules.openRedirectParams) {
      const value = parsed.searchParams.get(key);
      if (value && /^https?:\/\//i.test(value)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function scoreUrl(rawUrl: string, assumesScheme = false): UrlScoreResult | null {
  const facts = parseUrl({ url: rawUrl, assumesScheme });
  if (!facts) return null;

  const signals: Signal[] = [];
  let floor = 0;
  let additive = 0;
  let needsExpand = false;

  const addFloor = (id: string, value: number, detail?: Record<string, string>) => {
    floor = Math.max(floor, value);
    signals.push({ id, weight: value, detail });
  };
  const addPoints = (id: string, points: number, detail?: Record<string, string>) => {
    additive += points;
    signals.push({ id, weight: points, detail });
  };

  const denyHost = rules.denyHosts.includes(facts.host);
  const denyPattern = rules.denyPatterns.some((pattern) => new RegExp(pattern, "i").test(facts.host));
  if (denyHost || denyPattern) addFloor("deny_list", 95);

  const brands = brandHits(facts);
  if (brands.length > 0) {
    const first = brands[0]!;
    const display = BRAND_DISPLAY[first.brand] ?? first.brand;
    addFloor("brand_token_outside_domain", 85, { brand: display, official: first.official });
  }

  const credentialPath = facts.pathShape !== "/" && facts.pathShape !== ":path";
  if (credentialPath && brands.length > 0) addFloor("credential_path_with_brand", 80);

  if (facts.punycode || facts.mixedScript) addFloor("punycode_or_mixed_script", 80);
  if (facts.hasUserinfo) addFloor("userinfo_obfuscation", 70);
  if (facts.ipLiteral) addFloor("ip_literal_host", 60);
  if (credentialPath && facts.scheme === "http:") addFloor("login_on_http", 60);
  if (facts.privateHost) {
    addFloor("private_host", 55);
    needsExpand = true;
  }

  if (rules.shorteners.includes(facts.registrable)) {
    addFloor("shortener_no_destination", 45);
    needsExpand = true;
  }
  if (hasOpenRedirect(rawUrl)) {
    addFloor("open_redirect_param", 45);
    needsExpand = true;
  }

  if (facts.subdomainCount >= 4) addPoints("many_subdomains", 20);
  const hyphens = (facts.host.match(/-/g) ?? []).length;
  if (hyphens >= 3) addPoints("many_hyphens", 15);
  if (rules.suspiciousTlds.includes(facts.tld)) {
    addPoints("suspicious_tld", 25, { tld: facts.tld });
    const signInWords = /(secure|verify|login|signin|account|update|refund|claim)/.test(facts.host);
    if (signInWords) addFloor("credential_words_with_bad_tld", 60);
  }
  if (credentialPath) addPoints("credential_path", 25);

  const known = isKnownBrandDomain(facts);
  if (known) {
    signals.unshift({ id: "known_brand_domain", weight: 0, detail: { official: known } });
  }

  const score = Math.max(floor, Math.min(100, additive));

  return {
    score,
    floor,
    tier: tierFor(score),
    signals,
    domain: {
      registrable: facts.registrable,
      tld: facts.tld,
      subdomains: facts.subdomainCount,
      ipLiteral: facts.ipLiteral,
      punycode: facts.punycode,
      privateHost: facts.privateHost,
    },
    needsExpand,
    display: displayUrl(facts),
  };
}

export function scoreUrlFromText(text: string): UrlScoreResult | null {
  const extracted = extractFirstUrl(text);
  if (!extracted) return null;
  return scoreUrl(extracted.url, extracted.assumesScheme);
}
