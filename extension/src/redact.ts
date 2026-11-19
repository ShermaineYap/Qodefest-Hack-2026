import type { Analysis, RedactedPayload, RedactionCounts } from './types.ts';

type OkAnalysis = Extract<Analysis, { ok: true }>;

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+(?![\w.-])/g;
const MOBILE = /(?:\+?60|0)1\d[- ]?\d{3,4}[- ]?\d{4}/g;
const LANDLINE = /\b0[3-9]\d[- ]?\d{3,4}[- ]?\d{4}\b/g;
const ID = /\b\d{6}-\d{2}-\d{4}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const WALLET = /\b0x[a-fA-F0-9]{40}\b/g;

function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}

function queryParamCount(input: string): number {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
    let count = 0;
    for (const _key of url.searchParams.keys()) count += 1;
    return count;
  } catch {
    return 0;
  }
}

function countRedactions(input: string): RedactionCounts {
  const emailMatches = new Set([...input.matchAll(EMAIL)].map((match) => match[0]));
  const phoneMatches = new Set(
    [...input.matchAll(MOBILE), ...input.matchAll(LANDLINE)].map((match) => match[0]),
  );
  return {
    queryParams: queryParamCount(input),
    emails: emailMatches.size,
    phones: phoneMatches.size,
    ids: countMatches(input, ID),
    cards: countMatches(input, CARD),
    wallets: countMatches(input, WALLET),
  };
}

export function buildPayload(input: string, analysis: OkAnalysis): RedactedPayload {
  const { facts, hits } = analysis;
  return {
    v: 1,
    scheme: facts.scheme,
    host: facts.host,
    registrable: facts.registrable,
    tld: facts.tld,
    subdomainCount: facts.subdomainCount,
    pathShape: facts.pathShape,
    flags: {
      ipLiteral: facts.ipLiteral,
      punycode: facts.punycode,
      mixedScript: facts.mixedScript,
      homoglyph: facts.homoglyph,
      userinfo: facts.userinfo,
      shortener: facts.isShortener,
      suspiciousTld: facts.suspiciousTld,
      hyphenHeavy: facts.hyphenHeavy,
      openRedirect: facts.hasOpenRedirect,
    },
    localSignals: hits.map((entry) => entry.name),
    redactions: countRedactions(input),
  };
}

export function previewLines(payload: RedactedPayload): string[] {
  const lines = [`Domain: ${payload.host}`];
  if (payload.pathShape !== '') {
    lines.push(`Path type: ${payload.pathShape} (not the full path)`);
  }
  if (payload.flags.punycode || payload.flags.mixedScript || payload.flags.homoglyph) {
    lines.push('Lookalike characters: yes');
  }
  if (payload.flags.userinfo) lines.push('Hidden destination before @: yes');
  if (payload.flags.ipLiteral) lines.push('Number-only address: yes');
  if (payload.flags.shortener) lines.push('Short link: yes');
  if (payload.flags.openRedirect) lines.push('Redirect parameter: yes');

  const { redactions } = payload;
  const removed = Object.values(redactions).reduce((sum, value) => sum + value, 0);
  lines.push(
    removed > 0
      ? `Removed before sending: ${removed} private detail(s).`
      : 'Removed before sending: query string, full path and any private details.',
  );
  return lines;
}
