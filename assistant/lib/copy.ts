import type { Lang, Tier, Verdict } from "./types.ts";

/** All user-facing wording. Short sentences, one action. BM strings need a human check. */
export const COPY = {
  title: {
    HIGH: { en: "This looks like a scam.", ms: "Ini nampak macam penipuan." },
    MEDIUM: { en: "Be careful with this one.", ms: "Hati-hati dengan yang ini." },
    LOW: { en: "Nothing unusual found.", ms: "Tiada yang luar biasa ditemui." },
    NOT_CHECKED: { en: "I could not check this.", ms: "Saya tidak dapat semak ini." },
  },
  action: {
    go_back: { en: "Go back to safety", ms: "Kembali ke tempat selamat" },
    open: { en: "Open the link", ms: "Buka pautan" },
    call_997: { en: "Call 997 now", ms: "Hubungi 997 sekarang" },
    try_again: { en: "Try again", ms: "Cuba lagi" },
    ask_trusted: { en: "Ask someone I trust", ms: "Tanya orang yang saya percaya" },
  },
  quick: {
    HIGH: { en: ["Why?", "What if I already clicked?", "Check another"], ms: ["Kenapa?", "Kalau saya dah klik?", "Semak lain"] },
    MEDIUM: { en: ["Why?", "Check another"], ms: ["Kenapa?", "Semak lain"] },
    LOW: { en: ["Check another"], ms: ["Semak lain"] },
    NOT_CHECKED: { en: ["Check another"], ms: ["Semak lain"] },
  },
  checked: {
    address: { en: "the website address", ms: "alamat laman web" },
    redirects: { en: "where the link really goes", ms: "ke mana pautan sebenarnya pergi" },
    message: { en: "the words in the message", ms: "perkataan dalam mesej" },
  },
  notChecked: {
    owner: { en: "who owns the website", ms: "siapa pemilik laman web" },
    page: { en: "what the page itself shows", ms: "kandungan halaman itu sendiri" },
    redirects: { en: "where the short link goes (it did not answer)", ms: "ke mana pautan pendek pergi (tiada jawapan)" },
  },
  lowNote: {
    en: "This is not a promise it is safe. If it asks for your password or money, stop.",
    ms: "Ini bukan jaminan ia selamat. Jika ia minta kata laluan atau wang, berhenti.",
  },
  officialNote: { en: (b: string) => `This is ${b}'s real website.`, ms: (b: string) => `Ini laman sebenar ${b}.` },
  failed: {
    en: "Something went wrong on our side, so I have not checked it. Please do not open it until you can check.",
    ms: "Ada masalah di pihak kami, jadi saya belum menyemaknya. Jangan buka dahulu sehingga dapat disemak.",
  },
  empty: { en: "Paste a link or a message and I will check it.", ms: "Tampal pautan atau mesej, saya akan semak." },
};


export const t = (o: { en: string; ms: string }, lang: Lang) => o[lang];

export function actionFor(tier: Tier, contact: boolean): Verdict["action"]["kind"] {
  if (tier === "HIGH") return contact ? "call_997" : "go_back";
  if (tier === "MEDIUM") return "ask_trusted";
  if (tier === "NOT_CHECKED") return "try_again";
  return "open";
}
