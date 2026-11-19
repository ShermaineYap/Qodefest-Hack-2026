export interface RuleHit {
  name: string;
  detail: string;
  floor: number;
  add: number;
}

export interface UrlFacts {
  scheme: 'http' | 'https';
  host: string;
  registrable: string;
  tld: string;
  subdomainCount: number;
  ipLiteral: boolean;
  punycode: boolean;
  mixedScript: boolean;
  homoglyph: boolean;
  userinfo: boolean;
  pathShape: string;
  isShortener: boolean;
  suspiciousTld: boolean;
  hyphenHeavy: boolean;
  hasOpenRedirect: boolean;
}

export type Analysis =
  | { ok: true; facts: UrlFacts; hits: RuleHit[]; localScore: number }
  | { ok: false; reason: string };

export interface RedactionCounts {
  queryParams: number;
  emails: number;
  phones: number;
  ids: number;
  cards: number;
  wallets: number;
}

export interface RedactedPayload {
  v: 1;
  scheme: string;
  host: string;
  registrable: string;
  tld: string;
  subdomainCount: number;
  pathShape: string;
  flags: {
    ipLiteral: boolean;
    punycode: boolean;
    mixedScript: boolean;
    homoglyph: boolean;
    userinfo: boolean;
    shortener: boolean;
    suspiciousTld: boolean;
    hyphenHeavy: boolean;
    openRedirect: boolean;
  };
  localSignals: string[];
  redactions: RedactionCounts;
}
