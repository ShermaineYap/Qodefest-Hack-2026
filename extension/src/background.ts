import { API_BASE, SCORE_PATH, SCORE_TIMEOUT_MS } from './config.ts';
import { analyseUrl } from './link.ts';
import type { ExtensionMessage, RiskResult, ScoreStatus, Tier } from './messages.ts';
import { TIER_RANK } from './messages.ts';
import { buildPayload } from './redact.ts';
import type { Analysis, RedactedPayload } from './types.ts';

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

async function scorePayload(payload: RedactedPayload): Promise<ScoreStatus> {
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

  const result = cached ? worseResult(cached, fresh) : fresh;
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

async function handle(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'score':
      return scorePayload(message.payload);
    case 'get-verdict':
      return getVerdict(message.url);
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
  const verdict = await scorePayload(payload);
  if (verdict.status !== 'scored' || verdict.result.tier !== 'high') return false;

  warned.add(url);
  const tab = await chrome.tabs.get(details.tabId);
  if (tab.url !== url) return false;

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
