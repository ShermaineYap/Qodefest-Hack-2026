import { API_BASE, ASSISTANT_BASE, ASSISTANT_PATH, ASSISTANT_TIMEOUT_MS, SCORE_PATH, SCORE_TIMEOUT_MS } from './config.ts';
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
// The service worker stays the only network surface. Memory only: nothing is stored.
const ASSISTANT_SESSION = `sess_${crypto.randomUUID()}`;
const ASSISTANT_TIERS = new Set(['HIGH', 'MEDIUM', 'LOW', 'NOT_CHECKED']);

function parseAssistant(raw: unknown): AssistantResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const v = body.verdict as Record<string, unknown> | undefined;
  if (!v || typeof v.tier !== 'string' || !ASSISTANT_TIERS.has(v.tier)) return null;
  const reasons = Array.isArray(v.reasons)
    ? v.reasons.map((r) => (r && typeof (r as { text?: unknown }).text === 'string' ? (r as { text: string }).text : '')).filter(Boolean)
    : [];
  const notChecked = Array.isArray(v.notChecked)
    ? v.notChecked.map((n) => (n && typeof (n as { why?: unknown }).why === 'string' ? (n as { why: string }).why : '')).filter(Boolean)
    : [];
  const actions = Array.isArray(v.actions) ? v.actions : [];
  const first = actions[0] as { label?: unknown } | undefined;
  return {
    requestId: typeof body.requestId === 'string' ? body.requestId : 'unknown',
    tier: v.tier as AssistantResult['tier'],
    label: typeof v.label === 'string' ? v.label : '',
    summary: typeof v.summary === 'string' ? v.summary : '',
    reasons: reasons.slice(0, MAX_SENTENCES),
    checked: stringArray(v.checked, MAX_SENTENCES),
    notChecked: notChecked.slice(0, MAX_SENTENCES),
    action: first && typeof first.label === 'string' ? first.label : null,
    basis: typeof v.basis === 'string' ? v.basis : 'unknown',
  };
}

async function askAssistant(text: string, locale: 'en' | 'ms'): Promise<AskStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);
  try {
    const response = await fetch(`${ASSISTANT_BASE}${ASSISTANT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyId: 'shou-v1', sessionId: ASSISTANT_SESSION, text: text.slice(0, 2000), locale, surface: 'extension-panel' }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'not_checked', reason: 'The assistant did not answer. Treat this as unverified.' };
    const result = parseAssistant(await response.json());
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
      return askAssistant(message.text, message.locale);
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
  if (url.startsWith(API_BASE) || url.startsWith(ASSISTANT_BASE)) return false;
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
