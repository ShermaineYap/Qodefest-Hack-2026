import type { AskStatus, AssistantResult, AssistantTier, ScoreStatus, Tier } from '../messages.ts';
import type { Analysis, RedactedPayload } from '../types.ts';
import { analyseUrl, extractFirstUrl } from '../link.ts';
import { buildPayload, previewLines } from '../redact.ts';

// Lantern side panel: one conversation, two engines.
// - A link is scored by /risk/link (badge pipeline, redacted payload only) and can be explained by the
//   Lantern Assistant on request.
// - A message without a link goes straight to the Lantern Assistant.
// Every network call goes through the service worker. Nothing is stored; closing the panel forgets it.

type Lang = 'en' | 'ms';

const input = requireElement<HTMLTextAreaElement>('input');
const checkButton = requireElement<HTMLButtonElement>('check');
const inputError = requireElement<HTMLParagraphElement>('input-error');
const redaction = requireElement<HTMLDetailsElement>('redaction');
const redactionList = requireElement<HTMLUListElement>('redaction-list');
const log = requireElement<HTMLElement>('log');
const starters = requireElement<HTMLElement>('starters');

const COPIED_LABEL_MS = 2000;
const BM_HINT = /\b(anda|puan|encik|akaun|segera|jangan|sila|wang|pindahkan|bayar|sekarang|hari ini)\b/i;

const T = {
  en: {
    subtitle: 'Check a link or a message before you act on it.',
    inputLabel: 'Paste the link or the message',
    placeholder: 'For example: maybank-secure-login.xyz/login',
    check: 'Check',
    checkingLink: 'Checking this link…',
    asking: 'Asking Lantern Assistant…',
    hello: 'Hi. Paste a link or a message that worries you, and I will check it before you act.',
    starters: ['Is this link real?', 'Someone asked me for money', 'Is this message a scam?'],
    empty: 'Paste a link or a message first.',
    unreadable: 'That link could not be read.',
    couldNotCheck: 'Could not check this',
    couldNotCheckLink: 'Could not check this link',
    localSignals: (n: number) => `Local checks spotted ${n} warning signal(s) in the address.`,
    unreachable: 'The checking service did not answer. Treat this as unverified.',
    whatChecked: 'What I checked',
    notChecked: 'What I could not check',
    requestId: 'Request id',
    rulesOnly: 'checked by rules only',
    explain: 'Ask Lantern Assistant to explain',
    copy: 'Copy a summary for someone I trust',
    copied: 'Copied',
    copyFail: 'Could not copy',
    assistant: 'Lantern Assistant',
    footer: 'Nothing is saved. Closing this panel forgets everything.',
    redaction: 'What leaves this device',
    notes: {
      go_back: 'Good. Close that page and do not enter anything.',
      ask_someone: 'Show this to someone you trust before you open it.',
      open_link: 'Only continue if you were expecting it. Stop if it asks for a password or money.',
      call_997: 'Call 997 (National Scam Response Centre) from your phone now.',
      call_bank: 'Call the number on the back of your bank card.',
      clicked: 'If you clicked, do not type anything. Close the page, then call your bank.',
      paid: 'Call your bank now using the number on the back of your card, then call 997 (National Scam Response Centre). The sooner you call, the better the chance to stop the money.',
    } as Record<string, string>,
  },
  ms: {
    subtitle: 'Semak pautan atau mesej sebelum anda bertindak.',
    inputLabel: 'Tampal pautan atau mesej',
    placeholder: 'Contoh: maybank-secure-login.xyz/login',
    check: 'Semak',
    checkingLink: 'Menyemak pautan ini…',
    asking: 'Bertanya kepada Pembantu Lantern…',
    hello: 'Hai. Tampal pautan atau mesej yang merisaukan anda, saya akan semak sebelum anda bertindak.',
    starters: ['Pautan ini betul ke?', 'Ada orang minta duit', 'Mesej ini penipuan ke?'],
    empty: 'Tampal pautan atau mesej dahulu.',
    unreadable: 'Pautan itu tidak dapat dibaca.',
    couldNotCheck: 'Tidak dapat menyemak ini',
    couldNotCheckLink: 'Tidak dapat menyemak pautan ini',
    localSignals: (n: number) => `Semakan pada peranti menemui ${n} tanda amaran pada alamat ini.`,
    unreachable: 'Perkhidmatan semakan tidak menjawab. Anggap ini belum disahkan.',
    whatChecked: 'Apa yang disemak',
    notChecked: 'Apa yang tidak dapat disemak',
    requestId: 'ID permintaan',
    rulesOnly: 'disemak dengan peraturan sahaja',
    explain: 'Minta Pembantu Lantern terangkan',
    copy: 'Salin ringkasan untuk orang yang saya percaya',
    copied: 'Disalin',
    copyFail: 'Tidak dapat menyalin',
    assistant: 'Pembantu Lantern',
    footer: 'Tiada apa yang disimpan. Menutup panel ini akan melupakan semuanya.',
    redaction: 'Apa yang keluar dari peranti ini',
    notes: {
      go_back: 'Bagus. Tutup halaman itu dan jangan masukkan apa-apa.',
      ask_someone: 'Tunjukkan ini kepada orang yang anda percaya sebelum membukanya.',
      open_link: 'Teruskan hanya jika anda memang menunggunya. Berhenti jika ia minta kata laluan atau wang.',
      call_997: 'Hubungi 997 (Pusat Respons Scam Kebangsaan) dari telefon anda sekarang.',
      call_bank: 'Hubungi nombor di belakang kad bank anda.',
      clicked: 'Jika anda sudah klik, jangan taip apa-apa. Tutup halaman itu, kemudian hubungi bank anda.',
      paid: 'Hubungi bank anda sekarang menggunakan nombor di belakang kad, kemudian hubungi 997 (Pusat Respons Scam Kebangsaan). Lebih cepat anda hubungi, lebih besar peluang wang dapat disekat.',
    } as Record<string, string>,
  },
};

const TIER_ORDER: Record<Tier, number> = { low: 0, medium: 1, high: 2 };
const TIER_CLASS: Record<Tier, string> = { low: 'card--low', medium: 'card--medium', high: 'card--high' };
const TIER_LABEL: Record<Tier, string> = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };
const ASSISTANT_CLASS: Record<AssistantTier, string> = {
  LOW: 'card--low',
  MEDIUM: 'card--medium',
  HIGH: 'card--high',
  NOT_CHECKED: 'card--unknown',
};
const ICON: Record<string, string> = { low: '🟢', medium: '🟡', high: '🔴', LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴', NOT_CHECKED: '⚠️' };

let lang: Lang = 'en';
let busy = false;

function L() {
  return T[lang];
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Panel element #${id} is missing`);
  return element as T;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function scrollToEnd(): void {
  log.scrollTop = log.scrollHeight;
}

function setError(message: string): void {
  inputError.textContent = message;
  inputError.hidden = false;
}

function clearError(): void {
  inputError.textContent = '';
  inputError.hidden = true;
}

// ---------- static copy + language ----------

function paintStatic(): void {
  document.documentElement.lang = lang;
  requireElement('subtitle').textContent = L().subtitle;
  requireElement('input-label').textContent = L().inputLabel;
  input.placeholder = L().placeholder;
  checkButton.textContent = L().check;
  requireElement('footer').textContent = L().footer;
  requireElement('redaction-title').textContent = L().redaction;
  document.querySelectorAll<HTMLButtonElement>('.lang__btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });
  renderStarters();
}

function renderStarters(): void {
  starters.replaceChildren(
    ...L().starters.map((label) => {
      const chip = make('button', 'chip', label);
      chip.type = 'button';
      chip.addEventListener('click', () => input.focus());
      return chip;
    }),
  );
}

// ---------- conversation pieces ----------

const CHECKED_LABEL: Record<Lang, Record<string, string>> = {
  en: { address: 'the address', the_words: 'the words', words: 'the words', redirects: 'where the link goes', page_url: 'this page address' },
  ms: { address: 'alamat', the_words: 'perkataan', words: 'perkataan', redirects: 'ke mana pautan pergi', page_url: 'alamat halaman ini' },
};

function checkedLabel(id: string): string {
  return CHECKED_LABEL[lang][id] ?? id.replace(/_/g, ' ');
}

function addUser(text: string): void {
  starters.hidden = true;
  log.append(make('div', 'bubble bubble--user', text));
  scrollToEnd();
}

function addBot(text: string): HTMLElement {
  const bubble = make('div', 'bubble bubble--bot', text);
  log.append(bubble);
  scrollToEnd();
  return bubble;
}

function addPending(text: string): HTMLElement {
  const card = make('div', 'card card--checking');
  card.append(make('p', 'checking', text));
  log.append(card);
  scrollToEnd();
  return card;
}

function note(card: HTMLElement, text: string): void {
  card.querySelector('.note')?.remove();
  card.append(make('p', 'note', text));
  scrollToEnd();
}

// ---------- link (badge pipeline) ----------

function describeUrl(raw: string): { url: string; payload: RedactedPayload } | { url: null } {
  try {
    const url = extractFirstUrl(raw);
    if (!url) return { url: null };
    const analysis = analyseUrl(url);
    if (!analysis.ok) return { url: null };
    return { url, payload: buildPayload(raw, analysis) };
  } catch {
    return { url: null };
  }
}

function renderRedactionPreview(raw: string): void {
  const described = describeUrl(raw);
  if (!described.url) {
    redactionList.replaceChildren();
    redaction.hidden = true;
    return;
  }
  const lines = previewLines(described.payload);
  redactionList.replaceChildren(...lines.map((line) => make('li', undefined, line)));
  redaction.hidden = lines.length === 0;
}

function isScoreStatus(value: unknown): value is ScoreStatus {
  if (typeof value !== 'object' || value === null || !('status' in value)) return false;
  const status = (value as { status: unknown }).status;
  return status === 'scored' || status === 'not_checked';
}

async function requestScore(payload: RedactedPayload, localScore: number): Promise<ScoreStatus> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: 'score', payload, localScore });
    if (isScoreStatus(response)) return response;
  } catch {
    // fall through: fail closed
  }
  return { status: 'not_checked', reason: L().unreachable, localSignals: [] };
}

function makeCopyButton(url: string, tier: Tier, headline: string, sentences: string[]): HTMLButtonElement {
  const button = make('button', 'button-secondary', L().copy);
  button.type = 'button';
  button.addEventListener('click', async () => {
    const summary = `Lantern: ${TIER_LABEL[tier]} — ${headline}\n${url}\n${sentences.join('\n')}`;
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(summary);
      button.textContent = L().copied;
    } catch {
      button.textContent = L().copyFail;
    } finally {
      window.setTimeout(() => {
        button.textContent = L().copy;
        button.disabled = false;
      }, COPIED_LABEL_MS);
    }
  });
  return button;
}

function linkCard(url: string, status: ScoreStatus, raw: string): HTMLElement {
  if (status.status === 'not_checked') {
    const card = make('div', 'card card--unknown');
    card.append(make('h2', 'card__headline', `${ICON.NOT_CHECKED} ${L().couldNotCheckLink}`));
    card.append(make('p', 'card__sentence', status.reason));
    if (status.localSignals.length > 0) card.append(make('p', 'card__sentence', L().localSignals(status.localSignals.length)));
    card.append(makeExplainButton(raw));
    return card;
  }
  const { result } = status;
  const card = make('div', `card ${TIER_CLASS[result.tier]}`);
  card.append(make('h2', 'card__headline', `${ICON[result.tier]} ${result.headline}`));
  for (const sentence of result.sentences) card.append(make('p', 'card__sentence', sentence));
  card.append(make('p', 'meta', `${L().whatChecked}: ${result.checked.join(', ')}.`));
  card.append(make('p', 'meta', `${L().requestId}: ${result.requestId}`));
  if (TIER_ORDER[result.tier] >= TIER_ORDER.medium) card.append(makeCopyButton(url, result.tier, result.headline, result.sentences));
  card.append(makeExplainButton(raw));
  return card;
}

function makeExplainButton(raw: string): HTMLButtonElement {
  const button = make('button', 'button-secondary button-explain', L().explain);
  button.type = 'button';
  button.addEventListener('click', () => {
    button.remove();
    void askAssistant(raw);
  });
  return button;
}

async function checkLink(raw: string, url: string): Promise<void> {
  let analysis: Analysis;
  try {
    analysis = analyseUrl(url);
  } catch {
    addBot(L().unreadable);
    return;
  }
  if (!analysis.ok) {
    addBot(analysis.reason);
    return;
  }
  const pending = addPending(L().checkingLink);
  const status = await requestScore(buildPayload(raw, analysis), analysis.localScore);
  pending.replaceWith(linkCard(url, status, raw));
  scrollToEnd();
}

// ---------- Lantern Assistant ----------

function isAskStatus(value: unknown): value is AskStatus {
  if (typeof value !== 'object' || value === null || !('status' in value)) return false;
  const status = (value as { status: unknown }).status;
  return status === 'answered' || status === 'not_checked';
}

async function requestAssistant(text: string): Promise<AskStatus> {
  const locale: Lang = lang === 'ms' || BM_HINT.test(text) ? 'ms' : 'en';
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: 'ask', text, locale });
    if (isAskStatus(response)) return response;
  } catch {
    // fall through: fail closed
  }
  return { status: 'not_checked', reason: L().unreachable };
}

function assistantCard(status: AskStatus, raw: string): HTMLElement {
  if (status.status === 'not_checked') {
    const card = make('div', 'card card--unknown');
    card.append(make('p', 'meta card__from', L().assistant));
    card.append(make('h2', 'card__headline', `${ICON.NOT_CHECKED} ${L().couldNotCheck}`));
    card.append(make('p', 'card__sentence', status.reason));
    return card;
  }
  const r: AssistantResult = status.result;
  const card = make('div', `card ${ASSISTANT_CLASS[r.tier]}`);
  card.append(make('p', 'meta card__from', L().assistant));
  card.append(make('h2', 'card__headline', `${ICON[r.tier]} ${r.label}`));
  if (r.summary) card.append(make('p', 'card__sentence', r.summary));

  const why = make('details', 'why');
  why.open = r.tier === 'HIGH' || r.tier === 'MEDIUM';
  why.append(make('summary', undefined, lang === 'ms' ? 'Kenapa' : 'Why'));
  const list = make('ul');
  for (const reason of r.reasons) list.append(make('li', undefined, reason));
  why.append(list);
  if (r.checked.length > 0) why.append(make('p', 'meta', `${L().whatChecked}: ${r.checked.map(checkedLabel).join(', ')}.`));
  if (r.notChecked.length > 0) why.append(make('p', 'meta', `${L().notChecked}: ${r.notChecked.join('; ')}.`));
  if (r.reasons.length > 0 || r.checked.length > 0 || r.notChecked.length > 0) card.append(why);

  for (const action of r.actions.slice(0, 1)) {
    const btn = make('button', 'button-primary', action.label);
    btn.type = 'button';
    btn.addEventListener('click', () => onAction(action.id, card, r));
    card.append(btn);
  }

  if (r.quickReplies.length > 0) {
    const chips = make('div', 'chips');
    for (const reply of r.quickReplies) {
      const chip = make('button', 'chip', reply.label);
      chip.type = 'button';
      chip.addEventListener('click', () => onQuickReply(reply.id, reply.label, card, why, raw));
      chips.append(chip);
    }
    card.append(chips);
  }

  card.append(make('p', 'meta', `${L().requestId}: ${r.requestId}${r.basis === 'rules_only' ? ` · ${L().rulesOnly}` : ''}`));
  return card;
}

function onAction(id: string, card: HTMLElement, r: AssistantResult): void {
  if (id === 'open_link' && r.subject) {
    const host = r.subject.split('/')[0];
    if (host) window.open(`https://${host}`, '_blank', 'noopener,noreferrer');
  }
  if (id === 'check_another') {
    input.value = '';
    input.focus();
  }
  note(card, L().notes[id] ?? L().notes.go_back);
}

function onQuickReply(id: string, label: string, card: HTMLElement, why: HTMLDetailsElement, raw: string): void {
  if (id === 'why' || id === 'what_checked') {
    why.open = true;
    scrollToEnd();
    return;
  }
  if (id === 'clicked') {
    addUser(label);
    addBot(L().notes.clicked);
    return;
  }
  if (id === 'another') {
    input.value = '';
    input.focus();
    return;
  }
  if (id === 'paid') {
    addUser(label);
    addBot(L().notes.paid);
    return;
  }
  note(card, label);
}

async function askAssistant(raw: string): Promise<void> {
  const pending = addPending(L().asking);
  const status = await requestAssistant(raw);
  pending.replaceWith(assistantCard(status, raw));
  scrollToEnd();
}

// ---------- submit ----------

async function submit(): Promise<void> {
  if (busy) return;
  clearError();
  const raw = input.value.trim();
  if (raw === '') {
    setError(L().empty);
    return;
  }
  busy = true;
  checkButton.disabled = true;
  addUser(raw);
  input.value = '';
  renderRedactionPreview('');
  try {
    let url: string | null = null;
    try {
      url = extractFirstUrl(raw);
    } catch {
      url = null;
    }
    if (url) await checkLink(raw, url);
    else await askAssistant(raw);
  } finally {
    busy = false;
    checkButton.disabled = false;
  }
}

input.addEventListener('input', () => renderRedactionPreview(input.value));
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void submit();
  }
});
checkButton.addEventListener('click', () => void submit());
document.querySelectorAll<HTMLButtonElement>('.lang__btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    lang = btn.dataset.lang === 'ms' ? 'ms' : 'en';
    paintStatic();
    if (log.children.length === 1 && greeting) greeting.textContent = L().hello;
  });
});

paintStatic();
const greeting = addBot(L().hello);
