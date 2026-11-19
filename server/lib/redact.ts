// Redaction runs before anything is shown to the model or written to a log.
// It is deliberately blunt: a false positive costs one masked number.

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
}

const PATTERNS: Array<{ key: string; re: RegExp; mask: string }> = [
  { key: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, mask: "[email]" },
  { key: "card", re: /\b(?:\d[ -]?){15,16}\b/g, mask: "[card]" },
  { key: "nric", re: /\b\d{6}[- ]?\d{2}[- ]?\d{4}\b/g, mask: "[id]" },
  {
    key: "phone",
    re: /(?:\+?60|0)1\d[\s-]?\d{3,4}[\s-]?\d{3,4}|\b0[3-9]\d[\s-]?\d{3,4}[\s-]?\d{4}\b/g,
    mask: "[phone]",
  },
  { key: "account", re: /\b\d{10,16}\b/g, mask: "[number]" },
];

export function redactText(input: string): RedactionResult {
  let text = input;
  const counts: Record<string, number> = {};
  for (const { key, re, mask } of PATTERNS) {
    let hits = 0;
    text = text.replace(re, () => {
      hits += 1;
      return mask;
    });
    if (hits > 0) counts[key] = hits;
  }
  return { text, counts };
}

/** Copy for the UI: "2 phone numbers, 1 account number (hidden)". */
export function describeRedactions(counts: Record<string, number>, locale: "en" | "ms"): string {
  const parts: string[] = [];
  const label = (key: string, n: number) => {
    if (locale === "ms") {
      if (key === "phone") return `${n} nombor telefon`;
      if (key === "account") return `${n} nombor akaun`;
      if (key === "nric") return `${n} nombor kad pengenalan`;
      if (key === "card") return `${n} nombor kad`;
      return `${n} alamat e-mel`;
    }
    if (key === "phone") return `${n} phone number${n > 1 ? "s" : ""}`;
    if (key === "account") return `${n} account number${n > 1 ? "s" : ""}`;
    if (key === "nric") return `${n} IC number${n > 1 ? "s" : ""}`;
    if (key === "card") return `${n} card number${n > 1 ? "s" : ""}`;
    return `${n} email address${n > 1 ? "es" : ""}`;
  };
  for (const [key, n] of Object.entries(counts)) {
    if (n > 0) parts.push(label(key, n));
  }
  return parts.join(", ");
}
