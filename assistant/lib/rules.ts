import type { MessageResult, Signal, Tier, UrlResult } from "./types.ts";

/**
 * Deterministic layer. Always runs, explainable, unit-tested.
 * Code owns the verdict: floors can never be lowered by a model.
 */

// Brand token -> official registrable domains.
export const BRANDS: Record<string, { name: string; domains: string[] }> = {
  maybank: { name: "Maybank", domains: ["maybank2u.com.my", "maybank.com.my", "maybank.com"] },
  cimb: { name: "CIMB", domains: ["cimbclicks.com.my", "cimb.com.my", "cimb.com"] },
  publicbank: { name: "Public Bank", domains: ["pbebank.com", "publicbank.com.my"] },
  pbebank: { name: "Public Bank", domains: ["pbebank.com"] },
  rhb: { name: "RHB", domains: ["rhbgroup.com", "rhbnow.com.my"] },
  hongleong: { name: "Hong Leong Bank", domains: ["hlb.com.my", "hongleongconnect.my"] },
  ambank: { name: "AmBank", domains: ["ambank.com.my", "ambankgroup.com"] },
  bankislam: { name: "Bank Islam", domains: ["bankislam.com", "bankislam.biz"] },
  bsn: { name: "BSN", domains: ["bsn.com.my", "mybsn.com.my"] },
  touchngo: { name: "Touch 'n Go", domains: ["touchngo.com.my", "tngdigital.com.my"] },
  tngdigital: { name: "Touch 'n Go", domains: ["tngdigital.com.my"] },
  shopee: { name: "Shopee", domains: ["shopee.com.my", "shopee.com"] },
  lazada: { name: "Lazada", domains: ["lazada.com.my", "lazada.com"] },
  poslaju: { name: "Pos Laju", domains: ["pos.com.my"] },
  posmalaysia: { name: "Pos Malaysia", domains: ["pos.com.my"] },
  lhdn: { name: "LHDN", domains: ["hasil.gov.my"] },
  hasil: { name: "LHDN", domains: ["hasil.gov.my"] },
  kwsp: { name: "KWSP", domains: ["kwsp.gov.my"] },
  pdrm: { name: "PDRM", domains: ["rmp.gov.my", "pdrm.gov.my"] },
  jpj: { name: "JPJ", domains: ["jpj.gov.my"] },
  mysejahtera: { name: "MySejahtera", domains: ["mysejahtera.malaysia.gov.my", "malaysia.gov.my"] },
};

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "s.id", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "tiny.cc", "ow.ly", "rebrand.ly", "t.ly", "goo.su"];
const SUSPICIOUS_TLDS = ["xyz", "top", "click", "icu", "buzz", "live", "shop", "online", "site", "info", "cc", "tk", "ml", "ga", "cf", "gq", "rest", "cfd", "sbs", "vip", "work", "support", "lol"];
const CRED_PATH = /\/(login|log-in|signin|sign-in|verify|verification|secure|update|account|claim|bayar|pay|otp|tac|unlock)/i;
const SECOND_LEVEL = ["com", "gov", "org", "net", "edu", "co", "ac", "mil"];

const sig = (id: string, weight: number, floor: number, en: string, ms: string): Signal => ({ id, weight, floor, en, ms });

export function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const sld = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  if (tld.length === 2 && SECOND_LEVEL.includes(sld)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function parseUrl(raw: string): URL | null {
  let s = raw.trim().replace(/[)>\].,!?'"]+$/, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/** Remove query string and fragment: they can carry personal data and are never sent anywhere. */
export function stripUrl(raw: string): string {
  const u = parseUrl(raw);
  if (!u) return raw;
  return `${u.protocol}//${u.host}${u.pathname}`;
}

export const isShortener = (host: string) => SHORTENERS.includes(host.replace(/^www\./, ""));

export function scoreUrl(raw: string, finalRaw?: string): UrlResult {
  const u = parseUrl(finalRaw ?? raw);
  const signals: Signal[] = [];
  if (!u) {
    return { input: raw, finalUrl: raw, host: "", registrable: "", score: 0, floor: 0, signals, expanded: !!finalRaw };
  }
  const host = u.hostname.toLowerCase();
  const reg = registrableDomain(host);
  const labels = host.split(".");
  const tld = labels[labels.length - 1];

  // Official domain of a known brand: say so, it is the strongest LOW evidence we have.
  let officialFor: string | undefined;
  for (const b of Object.values(BRANDS)) {
    if (b.domains.some((d) => reg === d || host === d || host.endsWith("." + d))) officialFor = b.name;
  }

  if (u.username || u.password || /@/.test(u.href.split("/")[2] ?? "")) {
    signals.push(sig("userinfo", 40, 70, "The address hides the real website after an @ sign.", "Alamat ini menyembunyikan laman sebenar selepas tanda @."));
  }
  if (host.startsWith("xn--") || host.includes(".xn--") || /[^\x00-\x7f]/.test(host)) {
    signals.push(sig("punycode", 50, 80, "The address uses look-alike letters to copy a real website.", "Alamat ini guna huruf yang nampak sama untuk meniru laman sebenar."));
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) {
    signals.push(sig("ip_literal", 35, 60, "The address is a bare number, not a company website.", "Alamat ini hanya nombor, bukan laman syarikat."));
  }
  if (!officialFor) {
    const flat = host.replace(/[-.]/g, "");
    for (const [token, b] of Object.entries(BRANDS)) {
      if (flat.includes(token)) {
        signals.push(sig("brand_mismatch", 50, 85,
          `This is not ${b.name}'s website. The real one is ${b.domains[0]}.`,
          `Ini bukan laman ${b.name} yang sebenar. Yang sebenar ialah ${b.domains[0]}.`));
        if (CRED_PATH.test(u.pathname) || /login|secure|verify|update/.test(host)) {
          signals.push(sig("credential_bait", 20, 85, "It is set up to ask for your login or bank details.", "Ia dibuat untuk minta log masuk atau butiran bank anda."));
        }
        break;
      }
    }
  }
  if (isShortener(host)) {
    signals.push(sig("shortener", 25, 45, "It is a shortened link that hides where it really goes.", "Ini pautan pendek yang menyembunyikan destinasi sebenar."));
  }
  if (u.protocol === "http:" && CRED_PATH.test(u.pathname)) {
    signals.push(sig("insecure_login", 30, 60, "It asks you to log in without a secure connection.", "Ia minta anda log masuk tanpa sambungan selamat."));
  }
  if (SUSPICIOUS_TLDS.includes(tld) && !officialFor) {
    signals.push(sig("suspicious_tld", 25, 0, `Its ending ".${tld}" is often used by scam sites.`, `Hujung ".${tld}" sering digunakan oleh laman penipuan.`));
  }
  if ((reg.match(/-/g) ?? []).length >= 2 || labels.length >= 5) {
    signals.push(sig("messy_host", 15, 0, "The address is unusually long or messy.", "Alamat ini luar biasa panjang atau bercelaru."));
  }

  const score = Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
  const floor = signals.reduce((a, s) => Math.max(a, s.floor), 0);
  return {
    input: raw,
    finalUrl: `${u.protocol}//${u.host}${u.pathname}`,
    host,
    registrable: reg,
    score: Math.max(score, floor),
    floor,
    signals,
    expanded: !!finalRaw && finalRaw !== raw,
    officialFor,
  };
}

// ---- message rules (ported from SHOU, MUBA 2026) ----
const has = (h: string, needles: string[]) => needles.some((n) => h.includes(n));
const URGENCY = ["immediately", "right now", "urgent", "today", "within", "hurry", "act now", "last chance", "sekarang", "segera", "cepat", "hari ini", "dalam masa", "jangan tunggu", "马上", "立刻", "尽快"];
const AUTHORITY = ["pdrm", "police", "polis", "bukit aman", "inspektor", "inspector", "sarjan", "sergeant", "lhdn", "bank negara", "bnm", "court", "mahkamah", "warrant", "waran", "saman", "kastam", "customs", "sprm", "macc", "pegawai", "警察", "法院"];
const SECRECY = ["do not tell", "don't tell", "jangan beritahu", "jangan bagitahu", "confidential", "rahsia", "sulit", "secret", "保密", "别告诉"];
const CREDENTIAL = ["otp", "tac", "one-time password", "verification code", "pin number", "password", "kata laluan", "验证码", "密码"];
const SAFE_ACCOUNT = ["safe account", "akaun selamat", "secure account", "akaun sementara", "pindahkan simpanan", "transfer your savings", "安全账户"];
const LURE = ["guaranteed return", "pulangan terjamin", "double your money", "peluang pelaburan", "investment opportunity", "processing fee", "release fee", "yuran", "you have won", "anda menang", "保证收益"];

export function scoreMessage(text: string): MessageResult {
  const m = text.toLowerCase();
  const s: Signal[] = [];
  const a = has(m, AUTHORITY), u = has(m, URGENCY), sc = has(m, SECRECY), c = has(m, CREDENTIAL), sa = has(m, SAFE_ACCOUNT), l = has(m, LURE);
  if (a) s.push(sig("authority", 25, 0, "It claims to be the police, a court, LHDN or a bank.", "Ia mengaku dari polis, mahkamah, LHDN atau bank."));
  if (u) s.push(sig("urgency", 20, 0, "It pushes you to act right now.", "Ia mendesak anda bertindak sekarang juga."));
  if (sc) s.push(sig("secrecy", 25, 0, "It tells you to keep it from your family.", "Ia suruh anda rahsiakan daripada keluarga."));
  if (sa) s.push(sig("safe_account", 35, 70, "It asks you to move money to a 'safe account'. Real police and banks never do this.", "Ia minta anda pindah wang ke 'akaun selamat'. Polis dan bank sebenar tidak pernah buat begini."));
  if (c) s.push(sig("credential", 40, 85, "It asks for an OTP, TAC or password. No real bank ever asks for this.", "Ia minta OTP, TAC atau kata laluan. Tiada bank sebenar yang akan minta."));
  if (l) s.push(sig("lure", 20, 0, "It promises money or asks for a fee to release money.", "Ia janji wang atau minta yuran untuk lepaskan wang."));
  let floor = 0;
  if (c) floor = 85;
  else if (a && u && sc) floor = 80;
  else if (sa) floor = 70;
  else if (a && u) floor = 70;
  for (const x of s) x.floor = Math.max(x.floor, 0);
  const score = Math.max(Math.min(100, s.reduce((t, x) => t + x.weight, 0)), floor);
  return { score, floor, signals: s };
}

export const tierFor = (score: number): Tier => (score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW");

/**
 * The model may raise risk, never lower it, and on its own it can only reach MEDIUM.
 * HIGH always needs a rule floor of 70 or more.
 */
export function clampModel(ruleScore: number, ruleFloor: number, modelScore: number | null): { score: number; raised: boolean } {
  if (modelScore === null || !Number.isFinite(modelScore)) return { score: ruleScore, raised: false };
  const cap = ruleFloor >= 70 ? 100 : 69;
  const candidate = Math.min(Math.max(modelScore, 0), cap);
  return candidate > ruleScore ? { score: candidate, raised: true } : { score: ruleScore, raised: false };
}

export function officialContact(text: string, lang: "en" | "ms") {
  const m = text.toLowerCase();
  if (has(m, ["pdrm", "police", "polis", "bukit aman", "inspektor", "inspector", "sarjan", "sergeant"])) {
    return { label: lang === "ms" ? "Talian Pusat Respons Scam Kebangsaan (NSRC)" : "National Scam Response Centre (NSRC)", phone: "997" };
  }
  if (has(m, ["lhdn", "hasil"])) return { label: "LHDN HASiL Care Line", phone: "03-8911 1000" };
  return null;
}

export const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?)/gi;
export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.filter((x) => /[a-z]/i.test(x.split(".").pop() ?? "")))].slice(0, 2);
}
