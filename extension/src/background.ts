import { AGENT_PATH, AGENT_TIMEOUT_MS, API_BASE, SCORE_PATH, SCORE_TIMEOUT_MS } from './config.ts';
import { analyseUrl } from './link.ts';
import type { AskStatus, AssistantResult, ExtensionMessage, RiskResult, ScoreStatus, Tier } from './messages.ts';
import { TIER_RANK } from './messages.ts';
import { buildPayload } from './redact.ts';
import type { Analysis, RedactedPayload } from './types.ts';
import { elevate } from './verdict.ts';

const NOT_CHECKED_REASON =
  'The checking service did not answer. Treat this link as unverified.';
const GENERIC_FAILURE_REASON = 'Something went wrong.';

const DEFAULT_HEADLINE: Record<Tier, string> = {
  low: 'Nothing unusual about this link.',
  medium: 'This link looks off. Open it only if you were expecting it.',
  high: 'This looks like a scam link. Do not enter your password or bank details.',
};

const MAX_SENTENCES = 6;
const DEFAULT_CHECKED = ['domain'];
const WARNING_PAGE = 'warning/warning.html';

const verdicts = new Map<string, RiskResult>();
const warned = new Set<string>();

function notChecked(localSignals: string[], reason = NOT_CHECKED_REASON): ScoreStatus {
  return { status: 'not_checked', reason, localSignals };
}

function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function cacheKey(host: string, pathShape: string): string {
  return `${host}${pathShape}`;
}

function stringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const strings = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return strings.slice(0, limit);
}

function parseRiskResult(raw: unknown): RiskResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const tier = source.tier;
  if (tier !== 'low' && tier !== 'medium' && tier !== 'high') return null;

  const sentences = stringArray(source.sentences, MAX_SENTENCES);
  if (sentences.length === 0) return null;

  const requestId =
    typeof source.request_id === 'string' && source.request_id.length > 0
      ? source.request_id
      : 'unknown';
  const score = typeof source.score === 'number' && Number.isFinite(source.score) ? source.score : 0;
  const checkedSource = stringArray(source.checked, Number.MAX_SAFE_INTEGER);
  const checked = checkedSource.length > 0 ? checkedSource : [...DEFAULT_CHECKED];
  const headline =
    typeof source.headline === 'string' && source.headline.length > 0
      ? source.headline
      : DEFAULT_HEADLINE[tier];
  const category =
    typeof source.category === 'string' && source.category.length > 0 ? source.category : undefined;
  const heldForReview = source.held_for_review === true;

  return { requestId, tier, score, headline, sentences, checked, category, heldForReview };
}

function worseResult(first: RiskResult, second: RiskResult): RiskResult {
  const firstRank = TIER_RANK[first.tier];
  const secondRank = TIER_RANK[second.tier];
  if (firstRank !== secondRank) return firstRank > secondRank ? first : second;
  return second.score > first.score ? second : first;
}

async function scorePayload(payload: RedactedPayload, localScore: number): Promise<ScoreStatus> {
  const key = cacheKey(payload.host, payload.pathShape);
  const cached = verdicts.get(key);
  if (cached) return { status: 'scored', result: cached };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCORE_TIMEOUT_MS);

  let raw: unknown;
  try {
    const response = await fetch(`${API_BASE}${SCORE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return notChecked(payload.localSignals);
    raw = await response.json();
  } catch {
    return notChecked(payload.localSignals);
  } finally {
    clearTimeout(timer);
  }

  const fresh = parseRiskResult(raw);
  if (!fresh) return notChecked(payload.localSignals);

  const lifted = elevate(fresh, localScore);
  const result = cached ? worseResult(cached, lifted) : lifted;
  verdicts.set(key, result);
  return { status: 'scored', result };
}

function tabIdOf(sender: chrome.runtime.MessageSender): number | null {
  const tabId = sender.tab?.id;
  return typeof tabId === 'number' ? tabId : null;
}

async function goBack(tabId: number): Promise<{ ok: true }> {
  try {
    await chrome.tabs.goBack(tabId);
  } catch {
    await chrome.tabs.update(tabId, { url: 'https://www.google.com/' });
  }
  return { ok: true };
}

async function continueTo(tabId: number, url: string): Promise<{ ok: true }> {
  warned.add(url);
  await chrome.tabs.update(tabId, { url });
  return { ok: true };
}

async function getVerdict(url: string): Promise<ScoreStatus | null> {
  const analysis = analyseUrl(url);
  if (!analysis.ok) return null;
  const key = cacheKey(analysis.facts.host, analysis.facts.pathShape);
  const result = verdicts.get(key);
  return result ? { status: 'scored', result } : null;
}


// ---- Lantern Assistant: messages pasted into the side panel ----
// Calls the gateway's POST /agent/message (D-013). The service worker stays the only network surface.
// Only the text the user pasted is sent; no page URL, no history. Any failure is NOT CHECKED.
const AGENT_TIER: Record<string, AssistantResult['tier']> = { scam: 'HIGH', unsure: 'MEDIUM', not_scam: 'LOW' };

const AGENT_COPY = {
  en: {
    HIGH: 'This looks like a scam.',
    MEDIUM: 'Be careful with this one.',
    LOW: 'No scam signs found.',
    actions: { go_back: 'Go back to safety', ask_someone: 'Ask someone I trust', check_another: 'Check another' },
    replies: { why: 'Why?', clicked: 'What if I already clicked?', paid: 'I already paid', another: 'Check another' },
    checked: ['the words'],
    screenshot: 'the screenshot',
    notChecked: ['who really sent it'],
  },
  ms: {
    HIGH: 'Ini nampak macam penipuan.',
    MEDIUM: 'Hati-hati dengan yang ini.',
    LOW: 'Tiada tanda penipuan ditemui.',
    actions: { go_back: 'Kembali ke tempat selamat', ask_someone: 'Tanya orang yang saya percaya', check_another: 'Semak yang lain' },
    replies: { why: 'Kenapa?', clicked: 'Kalau saya dah klik?', paid: 'Saya sudah bayar', another: 'Semak yang lain' },
    checked: ['perkataan'],
    screenshot: 'tangkapan skrin',
    notChecked: ['siapa sebenarnya penghantar'],
  },
};

function parseAgent(raw: unknown, locale: 'en' | 'ms', hadImage = false): AssistantResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const tier = typeof body.status === 'string' ? AGENT_TIER[body.status] : undefined;
  if (!tier) return null;
  const copy = AGENT_COPY[locale];
  const reply = typeof body.reply === 'string' ? body.reply : '';
  const action =
    tier === 'HIGH'
      ? { id: 'go_back', label: copy.actions.go_back }
      : tier === 'MEDIUM'
        ? { id: 'ask_someone', label: copy.actions.ask_someone }
        : { id: 'check_another', label: copy.actions.check_another };
  const r = copy.replies;
  const quickReplies =
    tier === 'HIGH'
      ? [{ id: 'clicked', label: r.clicked }, { id: 'paid', label: r.paid }, { id: 'why', label: r.why }]
      : tier === 'MEDIUM'
        ? [{ id: 'why', label: r.why }, { id: 'another', label: r.another }]
        : [{ id: 'another', label: r.another }];
  const model = typeof body.model === 'string' ? body.model : 'unknown';
  return {
    requestId: typeof body.id === 'number' || typeof body.id === 'string' ? `msg_${body.id}` : 'unknown',
    tier,
    label: copy[tier as 'HIGH' | 'MEDIUM' | 'LOW'],
    summary: reply,
    reasons: stringArray(body.reasons, MAX_SENTENCES),
    checked: hadImage ? [...copy.checked, copy.screenshot] : copy.checked,
    notChecked: copy.notChecked,
    action: action.label,
    actions: [action],
    quickReplies,
    subject: '',
    basis: model === 'mock' ? 'rules_only' : model,
  };
}

const IMAGE_PREFIXES = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,'];
const MAX_IMAGE_CHARS = 6_000_000;

async function askAssistant(text: string, locale: 'en' | 'ms', image?: string): Promise<AskStatus> {
  const okImage = typeof image === 'string' && image.length <= MAX_IMAGE_CHARS && IMAGE_PREFIXES.some((p) => image.startsWith(p));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${AGENT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, client: 'extension', kind: okImage ? 'screenshot' : 'chat', text: text.slice(0, 8000), ts: new Date().toISOString(), ...(okImage ? { image } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'not_checked', reason: 'The assistant did not answer. Treat this as unverified.' };
    const result = parseAgent(await response.json(), locale, okImage);
    if (!result) return { status: 'not_checked', reason: 'The assistant gave an answer I could not read.' };
    return { status: 'answered', result };
  } catch {
    return { status: 'not_checked', reason: 'The assistant did not answer. Treat this as unverified.' };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'score':
      return scorePayload(message.payload, message.localScore);
    case 'get-verdict':
      return getVerdict(message.url);
    case 'ask':
      return askAssistant(message.text, message.locale, message.image);
    case 'go-back': {
      const tabId = tabIdOf(sender);
      if (tabId === null) return { ok: false, reason: 'No tab to go back from.' };
      return goBack(tabId);
    }
    case 'continue': {
      const tabId = tabIdOf(sender);
      if (tabId === null) return { ok: false, reason: 'No tab to continue in.' };
      return continueTo(tabId, message.url);
    }
    default:
      return null;
  }
}

async function onBeforeNavigate(details: chrome.webNavigation.WebNavigationParentedCallbackDetails) {
  if (details.frameId !== 0) return false;
  const url = details.url;
  if (!isHttpUrl(url)) return false;
  if (url.startsWith(API_BASE)) return false;
  if (warned.has(url)) return false;

  const analysis: Analysis = analyseUrl(url);
  if (!analysis.ok) return false;

  const payload = buildPayload(url, analysis);
  const verdict = await scorePayload(payload, analysis.localScore);
  if (verdict.status !== 'scored' || verdict.result.tier !== 'high') return false;

  // During onBeforeNavigate, tab.url is still the previous page and pendingUrl may not be set
  // yet, so only bail when a different navigation is actually pending.
  const tab = await chrome.tabs.get(details.tabId);
  if (tab.pendingUrl !== undefined && tab.pendingUrl !== url && tab.url !== url) return false;

  warned.add(url);
  const warningUrl = chrome.runtime.getURL(WARNING_PAGE) + '?u=' + encodeURIComponent(url);
  await chrome.tabs.update(details.tabId, { url: warningUrl });
  return true;
}

try {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} catch {
  // Chrome builds without the sidePanel API keep the default action behaviour.
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handle(message, sender)
    .then((response) => sendResponse(response))
    .catch(() => sendResponse(notChecked([], GENERIC_FAILURE_REASON)));
  return true;
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  onBeforeNavigate(details).catch(() => {});
});
