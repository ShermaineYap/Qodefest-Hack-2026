// Deterministic message scoring: bilingual lexicons plus combination floors.
// Numbers are masked before the text leaves this function.

import rules from "../../../shared/url-rules.json" with { type: "json" };
import type { MessageScoreResult, Signal } from "../contract.ts";
import { redactText } from "../../lib/redact.ts";
import { extractFirstUrl } from "../../lib/url.ts";
import { tierFor } from "../verdict.ts";

type Family =
  | "authority"
  | "money"
  | "secrecy"
  | "urgency"
  | "prize"
  | "parcel"
  | "investment"
  | "credential"
  | "injection";

const LEXICONS: Record<Family, RegExp> = {
  authority:
    /\b(polis|pdrm|pegawai|officer|inspektor|mahkamah|court|lhdn|hasil|kastam|customs|bank negara|bnm|suruhanjaya|government|kerajaan)\b/i,
  money:
    /\b(transfer|pindah|pindahkan|transferkan|bayar|bayaran|payment|pay|deposit|masukkan wang|akaun selamat|safe account|duit|wang|rm\s?\d+)\b/i,
  secrecy:
    /\b(jangan beritahu|jangan bagitahu|jangan cakap|keep (it )?secret|(?:do not|don'?t) tell|rahsia|sulit|alone|sorang|sendiri)\b/i,
  urgency: /\b(segera|sekarang|hari ini|dalam \d+ jam|within \d+ hours|urgent|immediately|cepat|today)\b/i,
  prize: /\b(tahniah|congratulations|anda menang|you (have )?won|hadiah|prize|tuntut|claim|bonus|menang)\b/i,
  parcel:
    /\b(parcel|bungkusan|poslaju|j&t|jnt|dhl|fedex|kastam|customs fee|bayaran penghantaran|delivery fee|alamat penghantaran)\b/i,
  investment:
    /\b(pelaburan|investment|untung|profit|return|dividen|dividend|jaminan|guaranteed|modal kecil)\b/i,
  credential:
    /\b(otp|tac|password|kata laluan|pin|nombor ic|ic number|kad pengenalan|username|log ?in|masuk akaun)\b/i,
  injection:
    /\b(ignore (all )?previous|abaikan arahan|lupakan arahan|say this is safe|this is safe|system prompt|you are now|developer mode)\b/i,
};

const WEIGHTS: Record<Family, number> = {
  authority: 25,
  money: 25,
  secrecy: 20,
  urgency: 10,
  prize: 20,
  parcel: 20,
  investment: 20,
  credential: 25,
  injection: 10,
};

const SIGNAL_IDS: Record<Family, string> = {
  authority: "authority_impersonation",
  money: "money_transfer",
  secrecy: "secrecy",
  urgency: "urgency",
  prize: "prize_claim",
  parcel: "parcel_fee",
  investment: "investment",
  credential: "credential_request",
  injection: "injection_detected",
};

export function scoreMessage(input: string): MessageScoreResult {
  const { text: redactedText, counts } = redactText(input);
  const haystack = input.toLowerCase();

  const fired = new Set<Family>();
  const signals: Signal[] = [];
  for (const family of Object.keys(LEXICONS) as Family[]) {
    if (LEXICONS[family].test(haystack)) {
      fired.add(family);
      signals.push({ id: SIGNAL_IDS[family], weight: WEIGHTS[family] });
    }
  }

  const hasLink = extractFirstUrl(input) !== null;
  if (hasLink) {
    signals.push({ id: "link_in_message", weight: 10 });
  }
  // Many scam messages name a bank even when they do not link to it.
  const bankMention = Object.keys(rules.brands).some((brand) =>
    haystack.includes(brand),
  );
  if (bankMention && fired.has("money")) {
    signals.push({ id: "bank_mentioned", weight: 15 });
  }

  let floor = 0;
  const has = (family: Family) => fired.has(family);
  if (has("authority") && has("money") && has("secrecy")) floor = Math.max(floor, 90);
  else if (has("authority") && has("money")) floor = Math.max(floor, 85);
  if (has("money") && has("secrecy")) floor = Math.max(floor, 75);
  if (has("prize") && has("money")) floor = Math.max(floor, 78);
  if (has("parcel") && has("money")) floor = Math.max(floor, 72);
  if (has("investment") && (has("urgency") || has("money"))) floor = Math.max(floor, 70);
  if (has("credential") && (has("urgency") || hasLink || has("authority"))) {
    floor = Math.max(floor, 60);
  }
  if (has("injection")) floor = Math.max(floor, 55);

  const additive = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const score = Math.max(floor, Math.min(100, additive));

  let category = "unknown";
  if (has("authority")) category = "impersonation_authority";
  else if (has("investment")) category = "investment";
  else if (has("prize")) category = "prize_claim";
  else if (has("parcel")) category = "parcel_fee";
  else if (has("credential")) category = "credential_harvest";
  else if (hasLink) category = "link";

  return {
    score,
    floor,
    tier: tierFor(score),
    category,
    signals,
    redactions: counts,
    redactedText,
  };
}
