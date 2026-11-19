import type { Analysis, RuleHit, UrlFacts } from './types.ts';

const MULTI_PART_SUFFIXES = new Set([
  'com.my', 'net.my', 'org.my', 'edu.my', 'gov.my',
  'com.sg', 'net.sg', 'org.sg', 'edu.sg', 'gov.sg',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'co.id', 'or.id', 'ac.id', 'go.id',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp',
  'co.in', 'net.in', 'org.in',
  'com.br', 'com.hk', 'com.tw', 'com.cn', 'com.ph', 'com.vn',
  'com.pk', 'com.bd', 'com.np', 'com.mx', 'com.ar', 'com.tr',
  'com.sa', 'com.ae', 'co.za', 'co.nz', 'co.th', 'co.kr',
]);

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 's.id', 'lnkd.in', 't.ly', 'rb.gy',
  'tiny.cc', 'surl.li', 'shorturl.ae',
]);

const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'club', 'work', 'click', 'link', 'live', 'icu', 'rest',
  'buzz', 'quest', 'cam', 'monster', 'sbs', 'cfd', 'bond', 'gq', 'tk',
  'ml', 'ga', 'cf', 'zip', 'mov', 'lol', 'bar',
]);

const DENY_LIST = new Set([
  'maybank-secure-login.xyz',
  'cimb-verify.top',
  'poslaju-fee.click',
  'tng-reload.top',
]);

const REDIRECT_PARAMS = new Set([
  'url', 'redirect', 'redirect_uri', 'redirect_url', 'next', 'continue',
  'return', 'returnurl', 'return_url', 'target', 'dest', 'destination', 'goto',
]);

const HOMOGLYPHS = new Set([
  '\u0430', '\u0435', '\u043E', '\u0440', '\u0441',
  '\u0443', '\u0445', '\u0456', '\u0455', '\u04BB',
  '\u0501', '\u04CF', '\u0458',
]);

const SCRIPT_RANGES = [
  /[\p{Script=Latin}]/u,
  /[\p{Script=Cyrillic}]/u,
  /[\p{Script=Greek}]/u,
  /[\p{Script=Arabic}]/u,
  /[\p{Script=Hebrew}]/u,
];

interface Brand {
  token: string;
  label: string;
  domains: string[];
}

const BRANDS: readonly Brand[] = [
  { token: 'maybank', label: 'Maybank', domains: ['maybank.com.my', 'maybank2u.com.my', 'maybank.com'] },
  { token: 'cimb', label: 'CIMB', domains: ['cimb.com.my', 'cimbclicks.com.my', 'cimb.com'] },
  { token: 'publicbank', label: 'Public Bank', domains: ['publicbank.com.my', 'pbebank.com'] },
  { token: 'rhb', label: 'RHB', domains: ['rhbgroup.com', 'rhb.com.my'] },
  { token: 'hongleong', label: 'Hong Leong Bank', domains: ['hlb.com.my', 'hongleongbank.com.my', 'hongleongconnect.my'] },
  { token: 'ambank', label: 'AmBank', domains: ['ambankgroup.com', 'ambank.com.my'] },
  { token: 'bsn', label: 'BSN', domains: ['bsn.com.my'] },
  { token: 'bimb', label: 'BIMB', domains: ['bimb.com.my'] },
  { token: 'bankislam', label: 'Bank Islam', domains: ['bankislam.com.my'] },
  { token: 'muamalat', label: 'Muamalat', domains: ['muamalat.com.my'] },
  { token: 'touchngo', label: "Touch 'n Go eWallet", domains: ['touchngo.com.my', 'tngdigital.com.my'] },
  { token: 'shopee', label: 'Shopee', domains: ['shopee.com.my', 'shopee.co.id', 'shopee.sg'] },
  { token: 'lazada', label: 'Lazada', domains: ['lazada.com.my', 'lazada.co.id', 'lazada.sg'] },
  { token: 'grab', label: 'Grab', domains: ['grab.com', 'grab.com.my', 'grabpay.com'] },
  { token: 'lhdn', label: 'LHDN', domains: ['lhdn.gov.my', 'hasil.gov.my'] },
  { token: 'myeg', label: 'MyEG', domains: ['myeg.com.my'] },
  { token: 'poslaju', label: 'PosLaju', domains: ['poslaju.com.my', 'pos.com.my'] },
  { token: 'dhl', label: 'DHL', domains: ['dhl.com', 'dhl.com.my'] },
  { token: 'fedex', label: 'FedEx', domains: ['fedex.com'] },
  { token: 'ninjavan', label: 'Ninja Van', domains: ['ninjavan.co', 'ninjavan.co.id'] },
  { token: 'jnt', label: 'J&T Express', domains: ['jtexpress.my', 'jnt.com.my'] },
  { token: 'apple', label: 'Apple', domains: ['apple.com', 'icloud.com', 'apple.com.my'] },
  { token: 'google', label: 'Google', domains: ['google.com', 'google.com.my', 'gmail.com', 'youtube.com'] },
  { token: 'microsoft', label: 'Microsoft', domains: ['microsoft.com', 'live.com', 'office.com', 'microsoftonline.com'] },
];

const PATH_SHAPES: ReadonlyArray<{ shape: string; pattern: RegExp }> = [
  { shape: '/login', pattern: /login|log-in|signin|sign-in|logon/ },
  { shape: '/verify', pattern: /verify|verification|validate/ },
  { shape: '/claim', pattern: /claim|reward|gift|prize/ },
  { shape: '/payment', pattern: /payment|billing|checkout|invoice|fee/ },
  { shape: '/wallet', pattern: /wallet|topup|top-up|reload/ },
  { shape: '/account', pattern: /account|profile|update|confirm|reset|unlock|recovery|secure|security/ },
];

const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'chrome:', 'about:'];

const EXPLICIT_URL = /https?:\/\/[^\s<>"']+/i;
const BARE_DOMAIN = /(?<![\w@.-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/i;

function extractRawHost(input: string): string {
  let rest = input.trim();
  const scheme = rest.match(/^[a-z][a-z0-9+.-]*:\/\//i);
  if (scheme) rest = rest.slice(scheme[0].length);
  rest = rest.split(/[\/?#]/, 1)[0] ?? '';
  const at = rest.lastIndexOf('@');
  if (at >= 0) rest = rest.slice(at + 1);
  const port = rest.indexOf(':');
  if (port >= 0 && !rest.startsWith('[')) rest = rest.slice(0, port);
  return rest.toLowerCase().replace(/\.+$/, '');
}

function isIpv4(host: string): boolean {
  const parts = host.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || isIpv4(host);
}

function splitHost(host: string): { registrable: string; tld: string } {
  if (isIpLiteral(host)) return { registrable: host, tld: '' };
  const labels = host.split('.');
  if (labels.length <= 2) return { registrable: host, tld: labels.length > 1 ? labels[1] : '' };
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return { registrable: labels.slice(-3).join('.'), tld: lastTwo };
  }
  return { registrable: lastTwo, tld: labels[labels.length - 1] };
}

function hasMixedScript(label: string): boolean {
  const present = SCRIPT_RANGES.filter((range) => range.test(label));
  return present.some((range) => range === SCRIPT_RANGES[0]) && present.length > 1;
}

function hasHomoglyph(label: string): boolean {
  for (const char of label) {
    if (HOMOGLYPHS.has(char)) return true;
  }
  return false;
}

function pathShapeOf(pathname: string): string {
  if (pathname === '' || pathname === '/') return '';
  const path = pathname.toLowerCase();
  const match = PATH_SHAPES.find((entry) => entry.pattern.test(path));
  return match ? match.shape : '/other';
}

function hasRedirectParam(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (REDIRECT_PARAMS.has(key.toLowerCase())) return true;
  }
  return false;
}

function findBrand(host: string, registrable: string): Brand | null {
  const compact = host.replace(/[^a-z0-9]/g, '');
  for (const brand of BRANDS) {
    if (compact.includes(brand.token) && !brand.domains.includes(registrable)) return brand;
  }
  return null;
}

function hit(name: string, detail: string, floor = 0, add = 0): RuleHit {
  return { name, detail, floor, add };
}

export function analyseUrl(input: string): Analysis {
  const trimmed = input.trim();
  if (trimmed === '') return { ok: false, reason: 'Paste a link first.' };

  const lower = trimmed.toLowerCase();
  if (BLOCKED_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return { ok: false, reason: 'Only web links can be checked.' };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'This does not look like a link.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only web links can be checked.' };
  }

  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '') return { ok: false, reason: 'This does not look like a link.' };

  const scheme = url.protocol === 'http:' ? 'http' : 'https';
  const rawHost = extractRawHost(trimmed);
  const rawLabels = rawHost.split('.');
  const { registrable, tld } = splitHost(host);
  const ipLiteral = isIpLiteral(host);
  const labels = host.split('.');
  const subdomainCount = ipLiteral ? 0 : Math.max(0, labels.length - registrable.split('.').length);

  const facts: UrlFacts = {
    scheme,
    host,
    registrable,
    tld,
    subdomainCount,
    ipLiteral,
    punycode: labels.some((label) => label.startsWith('xn--')),
    mixedScript: rawLabels.some(hasMixedScript),
    homoglyph: rawLabels.some(hasHomoglyph),
    userinfo: url.username !== '' || url.password !== '',
    pathShape: pathShapeOf(url.pathname),
    isShortener: SHORTENERS.has(registrable),
    suspiciousTld: SUSPICIOUS_TLDS.has(tld),
    hyphenHeavy: (host.match(/-/g) ?? []).length >= 3,
    hasOpenRedirect: hasRedirectParam(url.searchParams),
  };

  const hits: RuleHit[] = [];

  if (DENY_LIST.has(registrable) || DENY_LIST.has(host)) {
    hits.push(hit('deny_list', 'This address is on a known-scam list.', 95));
  }

  const brand = findBrand(host, registrable);
  if (brand) {
    hits.push(
      hit(
        'brand_impersonation',
        `The address mentions ${brand.label}, but ${brand.label}'s real domain is ${brand.domains[0]}.`,
        85,
      ),
    );
    const credentialPaths: readonly string[] = ['/login', '/verify', '/account'];
    if (brand && credentialPaths.includes(facts.pathShape)) {
      hits.push(
        hit(
          'credential_harvest',
          `It asks for a ${brand.label} login on a domain that is not ${brand.label}'s.`,
          80,
        ),
      );
    }
  }

  if (facts.punycode || facts.mixedScript || facts.homoglyph) {
    hits.push(
      hit(
        'lookalike_characters',
        facts.punycode
          ? 'The address uses encoded characters that can hide another name.'
          : 'The address uses lookalike characters to imitate a familiar name.',
        80,
      ),
    );
  }

  if (facts.userinfo) {
    hits.push(hit('userinfo_obfuscation', 'The address hides where it really goes before the @ sign.', 70));
  }

  if (facts.ipLiteral) {
    hits.push(hit('ip_literal', 'The address goes to a number instead of a name.', 60));
  }

  const signInPaths: readonly string[] = ['/login', '/verify', '/account'];
  if (facts.scheme === 'http' && signInPaths.includes(facts.pathShape)) {
    hits.push(hit('insecure_login', 'The page asks for a sign-in without a secure connection.', 60));
  }

  if (facts.isShortener) {
    hits.push(hit('shortener', 'This is a short link, so the real destination is hidden.', 45));
  }

  if (facts.hasOpenRedirect) {
    hits.push(hit('open_redirect', 'The address can forward you somewhere else.', 45));
  }

  if (facts.suspiciousTld) {
    hits.push(
      hit('suspicious_tld', `Addresses ending in .${tld} are often used by throwaway scam sites.`, 0, 20),
    );
  }

  if (facts.hyphenHeavy) {
    hits.push(hit('hyphen_heavy', 'The address uses many hyphens, a common trick in lookalike links.', 0, 15));
  }

  if (subdomainCount >= 3) {
    hits.push(hit('many_subdomains', 'The address stacks several subdomains, which can hide the real site.', 0, 20));
  }

  const floor = hits.reduce((max, entry) => Math.max(max, entry.floor), 0);
  const adds = hits.reduce((sum, entry) => sum + entry.add, 0);
  const localScore = Math.min(100, Math.max(floor, Math.min(35, adds)));

  return { ok: true, facts, hits, localScore };
}

function stripTrailing(value: string): string {
  return value.replace(/[),.;!?'"[\]]+$/, '');
}

export function extractFirstUrl(text: string): string | null {
  const explicit = text.match(EXPLICIT_URL);
  if (explicit) {
    const cleaned = stripTrailing(explicit[0]);
    if (cleaned !== '') return cleaned;
  }
  const bare = text.match(BARE_DOMAIN);
  if (bare) {
    const cleaned = stripTrailing(bare[0]);
    if (cleaned !== '') return cleaned;
  }
  return null;
}
