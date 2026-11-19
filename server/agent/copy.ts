// All user-facing copy is rendered here, from templates. The model never owns
// the label or the summary; it can add at most one extra reason.

import type {
  FollowUp,
  Locale,
  QuickReply,
  Signal,
  SubjectType,
  Tier,
  VerdictAction,
  VerdictReason,
} from "./contract.ts";

/**
 * BM GLOSSARY - Shermaine reviews this list (flag 9).
 * link -> pautan (not "tautan"), password -> kata laluan (not "kata sandi"),
 * money -> wang, account -> akaun, call -> hubungi, do not -> jangan,
 * scam -> penipuan, address -> alamat, message -> mesej, number -> nombor,
 * real -> sebenar, unusual -> luar biasa, someone you trust -> orang yang anda percaya.
 * "selamat" and "aman" are never used in verdict copy: we never call anything safe.
 */
export const BM_GLOSSARY: Record<string, string> = {
  link: "pautan",
  password: "kata laluan",
  money: "wang",
  account: "akaun",
  call: "hubungi",
  "do not": "jangan",
  scam: "penipuan",
  address: "alamat",
  message: "mesej",
  number: "nombor",
  real: "sebenar",
  unusual: "luar biasa",
  "someone you trust": "orang yang anda percaya",
};

interface ReasonCopy {
  en: (detail?: Record<string, string>) => string;
  ms: (detail?: Record<string, string>) => string;
}

const REASONS: Record<string, ReasonCopy> = {
  deny_list: {
    en: () => "This address is on a known scam list.",
    ms: () => "Alamat ini ada dalam senarai penipuan yang diketahui.",
  },
  brand_token_outside_domain: {
    en: (d) => `This is not ${d?.brand ?? "the company"}'s address. The real one is ${d?.official ?? "different"}.`,
    ms: (d) => `Ini bukan alamat ${d?.brand ?? "syarikat itu"}. Alamat sebenar ialah ${d?.official ?? "alamat lain"}.`,
  },
  credential_path_with_brand: {
    en: () => "It asks for a bank login, but it is not your bank.",
    ms: () => "Ia minta butiran log masuk bank, tetapi ia bukan bank anda.",
  },
  punycode_or_mixed_script: {
    en: () => "The address uses look-alike letters to copy a real name.",
    ms: () => "Alamat ini guna huruf yang meniru nama sebenar.",
  },
  userinfo_obfuscation: {
    en: () => "The real address is hidden after an @ sign.",
    ms: () => "Alamat sebenar tersembunyi selepas tanda @.",
  },
  ip_literal_host: {
    en: () => "Real companies use names, not number addresses.",
    ms: () => "Syarikat sebenar guna nama, bukan alamat nombor.",
  },
  login_on_http: {
    en: () => "This sign-in page is not secure.",
    ms: () => "Halaman log masuk ini tidak dilindungi.",
  },
  shortener_no_destination: {
    en: () => "A short link hides where it really goes.",
    ms: () => "Pautan pendek menyembunyikan destinasinya.",
  },
  open_redirect_param: {
    en: () => "The link can be made to open another site.",
    ms: () => "Pautan ini boleh membuka laman lain.",
  },
  private_host: {
    en: () => "This is a test address on this computer.",
    ms: () => "Ini alamat ujian pada komputer ini.",
  },
  many_subdomains: {
    en: () => "The address has too many parts.",
    ms: () => "Alamat ini ada terlalu banyak bahagian.",
  },
  many_hyphens: {
    en: () => "The address has many dashes, a common trick.",
    ms: () => "Alamat ini ada banyak sengkang, taktik biasa penipu.",
  },
  suspicious_tld: {
    en: (d) => `The ending .${d?.tld ?? ""} is often used by scammers.`,
    ms: (d) => `Hujung .${d?.tld ?? ""} sering digunakan oleh penipu.`,
  },
  credential_path: {
    en: () => "It asks you to sign in.",
    ms: () => "Ia minta anda log masuk.",
  },
  credential_words_with_bad_tld: {
    en: () => "It mixes sign-in words with an unusual ending.",
    ms: () => "Ia campurkan perkataan log masuk dengan hujung yang luar biasa.",
  },
  known_brand_domain: {
    en: (d) => `This is the real address for ${d?.official ?? "the company"}.`,
    ms: (d) => `Ini alamat sebenar untuk ${d?.official ?? "syarikat itu"}.`,
  },
  authority_impersonation: {
    en: () => "Real police do not ask for money by message.",
    ms: () => "Polis sebenar tidak minta wang melalui mesej.",
  },
  money_transfer: {
    en: () => "It asks you to move money.",
    ms: () => "Ia minta anda pindahkan wang.",
  },
  secrecy: {
    en: () => "It tells you to keep it secret. Real offices do not do that.",
    ms: () => "Ia minta anda rahsiakan. Pegawai sebenar tidak buat begitu.",
  },
  urgency: {
    en: () => "It pushes you to act fast.",
    ms: () => "Ia mendesak anda bertindak cepat.",
  },
  prize_claim: {
    en: () => "You did not enter a prize. There is no prize.",
    ms: () => "Anda tidak menyertai hadiah. Tiada hadiah.",
  },
  parcel_fee: {
    en: () => "Real couriers do not ask for money by message.",
    ms: () => "Kurier sebenar tidak minta bayaran melalui mesej.",
  },
  investment: {
    en: () => "High profit with no risk is not real.",
    ms: () => "Untung tinggi tanpa risiko tidak benar.",
  },
  credential_request: {
    en: () => "It asks for a password or OTP. Never share these.",
    ms: () => "Ia minta kata laluan atau OTP. Jangan kongsikan.",
  },
  link_in_message: {
    en: () => "It asks you to tap a link.",
    ms: () => "Ia minta anda tekan pautan.",
  },
  bank_mentioned: {
    en: () => "It names a bank you may trust.",
    ms: () => "Ia menyebut nama bank yang anda percaya.",
  },
  injection_detected: {
    en: () => "The message tries to tell the checker what to say.",
    ms: () => "Mesej ini cuba mengarahkan pemeriksa.",
  },
  no_scam_signals: {
    en: () => "We did not find common scam signs.",
    ms: () => "Kami tidak jumpa tanda penipuan biasa.",
  },
};

const LABELS: Record<string, { en: string; ms: string }> = {
  not_checked: { en: "Could not check this.", ms: "Tidak dapat menyemak ini." },
  high_url: { en: "This looks like a scam.", ms: "Ini nampak macam penipuan." },
  high_authority: {
    en: "This is a scam. The police do not ask for money on WhatsApp.",
    ms: "Ini penipuan. Polis tidak minta wang melalui WhatsApp.",
  },
  high_prize: { en: "This is a scam prize message.", ms: "Ini mesej hadiah palsu." },
  high_parcel: { en: "This is a scam delivery message.", ms: "Ini mesej penghantaran palsu." },
  high_investment: {
    en: "This is a scam investment offer.",
    ms: "Ini tawaran pelaburan palsu.",
  },
  medium_url: { en: "This link looks off.", ms: "Pautan ini mencurigakan." },
  medium_message: { en: "This message looks off.", ms: "Mesej ini mencurigakan." },
  low_url: {
    en: "Nothing unusual about this link.",
    ms: "Tiada yang luar biasa pada pautan ini.",
  },
  low_message: {
    en: "No common scam words in this message.",
    ms: "Tiada kata-kata penipuan biasa dalam mesej ini.",
  },
};

const SUMMARIES: Record<string, { en: string; ms: string }> = {
  high: {
    en: "Do not enter your password, OTP or bank details.",
    ms: "Jangan masukkan kata laluan, OTP atau butiran bank.",
  },
  medium: {
    en: "Do not open it unless you were expecting it.",
    ms: "Jangan buka melainkan anda memang menunggunya.",
  },
  low_url: {
    en: "Only open it if you were expecting it.",
    ms: "Buka hanya jika anda memang menunggunya.",
  },
  low_message: {
    en: "We checked the words only. We did not see who sent it.",
    ms: "Kami hanya semak perkataan. Kami tidak tahu siapa pengirimnya.",
  },
  not_checked: {
    en: "The checker is not available. Do not trust it until we can check.",
    ms: "Pemeriksa tidak tersedia. Jangan percaya dahulu.",
  },
};

const ACTIONS: Record<
  string,
  { en: string; ms: string; caption?: { en: string; ms: string } }
> = {
  go_back: { en: "Go back to safety", ms: "Jangan buka pautan ini" },
  open_link: { en: "Open the link", ms: "Buka pautan ini" },
  call_997: {
    en: "Call 997 now",
    ms: "Hubungi 997 sekarang",
    caption: {
      en: "National Scam Response Centre. If money already left your account, call your bank first.",
      ms: "Pusat Tindak Balas Penipuan Negara. Jika wang sudah keluar dari akaun, hubungi bank anda dahulu.",
    },
  },
  call_bank: {
    en: "Call your bank now",
    ms: "Hubungi bank anda sekarang",
    caption: {
      en: "Then call 997 and tell them what happened.",
      ms: "Kemudian hubungi 997 dan beritahu apa yang berlaku.",
    },
  },
  ask_someone: { en: "Ask someone you trust", ms: "Tanya orang yang anda percaya" },
  check_again: { en: "Try again", ms: "Cuba lagi" },
  check_another: { en: "Check another", ms: "Semak yang lain" },
};

const QUICK: Record<string, { en: string; ms: string }> = {
  why: { en: "Why?", ms: "Mengapa?" },
  clicked: { en: "What if I already clicked?", ms: "Sudah klik?" },
  already_paid: { en: "I already paid", ms: "Saya sudah bayar" },
  another: { en: "Check another", ms: "Semak yang lain" },
  what_checked: { en: "What did you check?", ms: "Apa yang disemak?" },
};

/** Model text is rejected if it makes a safety claim. */
const BANNED = /\b(safe|safety|aman|selamat|confirmed|definitely|guaranteed|100%)\b/i;

export function modelTextAllowed(text: string): boolean {
  return text.trim().length > 0 && text.length <= 200 && !BANNED.test(text);
}

function labelKey(tier: Tier, subjectType: SubjectType, category: string): string {
  if (tier === "NOT_CHECKED") return "not_checked";
  if (tier === "HIGH") {
    if (subjectType === "message") {
      if (category === "impersonation_authority") return "high_authority";
      if (category === "prize_claim") return "high_prize";
      if (category === "parcel_fee") return "high_parcel";
      if (category === "investment") return "high_investment";
    }
    return "high_url";
  }
  if (tier === "MEDIUM") return subjectType === "url" ? "medium_url" : "medium_message";
  return subjectType === "url" ? "low_url" : "low_message";
}

export interface RenderInput {
  locale: Locale;
  tier: Tier;
  category: string;
  subjectType: SubjectType;
  signals: Signal[];
  followUp?: FollowUp;
  redirectsChecked: boolean;
  redirectFailed: boolean;
  hadRedactions: boolean;
}

export interface RenderOutput {
  label: string;
  summary: string;
  reasons: VerdictReason[];
  action: VerdictAction;
  quickReplies: QuickReply[];
  checked: string[];
  notChecked: { id: string; why: string }[];
}

export function renderCopy(input: RenderInput): RenderOutput {
  const { locale, tier, category, subjectType, signals } = input;
  const L = (pair: { en: string; ms: string }) => (locale === "ms" ? pair.ms : pair.en);

  const reasons: VerdictReason[] = [];
  const noSignals = signals.length === 0;
  const ordered = [...signals].sort((a, b) => b.weight - a.weight);
  if (noSignals && tier !== "NOT_CHECKED") {
    ordered.push({ id: "no_scam_signals", weight: 0 });
  }
  for (const signal of ordered) {
    if (reasons.length >= 3) break;
    const copy = REASONS[signal.id];
    if (!copy) continue;
    reasons.push({
      signalId: signal.id,
      source: "rule",
      text: locale === "ms" ? copy.ms(signal.detail) : copy.en(signal.detail),
    });
  }

  let summary = L(SUMMARIES.not_checked!);
  if (tier === "HIGH") summary = L(SUMMARIES.high!);
  else if (tier === "MEDIUM") summary = L(SUMMARIES.medium!);
  else if (tier === "LOW") {
    summary = L(subjectType === "url" ? SUMMARIES.low_url! : SUMMARIES.low_message!);
  }

  const actionId = pickAction(tier, subjectType, category, input.followUp);
  const actionCopy = ACTIONS[actionId]!;

  const quickIds: string[] = [];
  if (tier === "HIGH" && subjectType === "message") quickIds.push("already_paid");
  if (tier === "HIGH" && subjectType === "url") quickIds.push("clicked");
  if (tier === "HIGH" || tier === "MEDIUM") quickIds.push("why");
  if (tier === "LOW") quickIds.push("what_checked");
  quickIds.push("another");

  const checked: string[] = [];
  const notChecked: { id: string; why: string }[] = [];
  if (subjectType === "url") {
    checked.push("address");
    if (input.redirectsChecked) {
      checked.push("redirects");
    } else {
      notChecked.push({
        id: "redirects",
        why: input.redirectFailed
          ? locale === "ms"
            ? "pautan tidak dapat dijejaki"
            : "the redirect could not be followed"
          : locale === "ms"
            ? "kami tidak ikut pautan ubah hala"
            : "we did not follow redirects",
      });
    }
    notChecked.push({
      id: "the_page_itself",
      why: locale === "ms" ? "kami tidak buka laman web" : "we do not open web pages",
    });
  } else {
    checked.push("the_words");
    if (input.hadRedactions) checked.push("phone_and_account_numbers_hidden");
    notChecked.push({
      id: "who_sent_it",
      why: locale === "ms" ? "kami tidak nampak pengirim" : "we cannot see the sender",
    });
  }

  return {
    label: L(LABELS[labelKey(tier, subjectType, category)]!),
    summary,
    reasons,
    action: {
      id: actionId,
      label: L({ en: actionCopy.en, ms: actionCopy.ms }),
      style: "primary",
      ...(actionCopy.caption ? { caption: L(actionCopy.caption) } : {}),
    },
    quickReplies: [...new Set(quickIds)].slice(0, 3).map((id) => ({
      id,
      label: L(QUICK[id]!),
    })),
    checked,
    notChecked,
  };
}

function pickAction(
  tier: Tier,
  subjectType: SubjectType,
  category: string,
  followUp?: FollowUp,
): string {
  if (tier === "NOT_CHECKED") return "check_again";
  if (tier === "HIGH") {
    if (subjectType === "message" && category === "impersonation_authority") {
      return followUp === "already_paid" ? "call_bank" : "call_997";
    }
    return subjectType === "url" ? "go_back" : "ask_someone";
  }
  if (tier === "MEDIUM") return "ask_someone";
  return subjectType === "url" ? "open_link" : "check_another";
}

/** Extra labels the panel needs when it answers without the server. */
export function uiStrings(locale: Locale) {
  const en = {
    title: "Ask SHOU",
    placeholder: "Paste a link or a message here.",
    checkLink: "Check this link",
    checkMessage: "Check this message",
    checking: "Checking…",
    couldNotCheck: "Could not check this.",
    couldNotReach: "Could not reach the checker.",
    tryAgain: "Try again",
    rulesOnly: "Checked by rules only.",
    whatChecked: "What I checked",
    notChecked: "Could not check",
    newCheck: "New check",
    useThisPage: "Use this page",
  };
  const ms = {
    title: "Tanya SHOU",
    placeholder: "Tampal pautan atau mesej di sini.",
    checkLink: "Semak pautan ini",
    checkMessage: "Semak mesej ini",
    checking: "Menyemak…",
    couldNotCheck: "Tidak dapat menyemak ini.",
    couldNotReach: "Tidak dapat hubungi pemeriksa.",
    tryAgain: "Cuba lagi",
    rulesOnly: "Disemak dengan peraturan sahaja.",
    whatChecked: "Apa yang disemak",
    notChecked: "Tidak dapat disemak",
    newCheck: "Semakan baru",
    useThisPage: "Guna halaman ini",
  };
  return locale === "ms" ? ms : en;
}
