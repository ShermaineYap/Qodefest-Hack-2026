import type { ScoreStatus, Tier } from '../messages.ts';
import type { Analysis, RedactedPayload } from '../types.ts';
import { analyseUrl, extractFirstUrl } from '../link.ts';
import { buildPayload, previewLines } from '../redact.ts';

const input = requireElement<HTMLTextAreaElement>('input');
const checkButton = requireElement<HTMLButtonElement>('check');
const inputError = requireElement<HTMLParagraphElement>('input-error');
const redaction = requireElement<HTMLDetailsElement>('redaction');
const redactionList = requireElement<HTMLUListElement>('redaction-list');
const resultBox = requireElement<HTMLElement>('result');

const COPY_LABEL = 'Copy a summary for someone I trust';
const UNREACHABLE_REASON = 'The checking service did not answer.';
const COPIED_LABEL_MS = 2000;

const TIER_ORDER: Record<Tier, number> = { low: 0, medium: 1, high: 2 };
const TIER_CLASS: Record<Tier, string> = {
  low: 'card--low',
  medium: 'card--medium',
  high: 'card--high',
};
const TIER_LABEL: Record<Tier, string> = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' };

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Panel element #${id} is missing`);
  }
  return element as T;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function setError(message: string): void {
  inputError.textContent = message;
  inputError.hidden = false;
}

function clearError(): void {
  inputError.textContent = '';
  inputError.hidden = true;
}

function describeUrl(raw: string): { url: string; payload: RedactedPayload } | { url: null } {
  try {
    const url = extractFirstUrl(raw);
    if (!url) {
      return { url: null };
    }
    const analysis = analyseUrl(url);
    if (!analysis.ok) {
      return { url: null };
    }
    return { url, payload: buildPayload(raw, analysis) };
  } catch {
    return { url: null };
  }
}

function clearRedactionPreview(): void {
  redactionList.replaceChildren();
  redaction.hidden = true;
}

function renderRedactionPreview(raw: string): void {
  const described = describeUrl(raw);
  if (!described.url) {
    clearRedactionPreview();
    return;
  }
  const lines = previewLines(described.payload);
  redactionList.replaceChildren(...lines.map((line) => make('li', undefined, line)));
  redaction.hidden = lines.length === 0;
}

function renderChecking(): void {
  const card = make('div', 'card card--checking');
  card.append(make('p', 'checking', 'Checking this link…'));
  resultBox.replaceChildren(card);
}

function renderScored(url: string, status: Extract<ScoreStatus, { status: 'scored' }>): void {
  const { result } = status;
  const card = make('div', `card ${TIER_CLASS[result.tier]}`);
  card.append(make('h2', 'card__headline', result.headline));

  for (const sentence of result.sentences) {
    card.append(make('p', 'card__sentence', sentence));
  }

  card.append(make('p', 'meta', `What I checked: ${result.checked.join(', ')}.`));
  card.append(make('p', 'meta', `Request id: ${result.requestId}`));

  if (result.heldForReview) {
    card.append(make('p', 'meta meta--flag', 'A person should look at this one.'));
  }

  if (TIER_ORDER[result.tier] >= TIER_ORDER.medium) {
    card.append(makeCopyButton(url, result.tier, result.headline, result.sentences));
  }

  resultBox.replaceChildren(card);
}

function renderNotChecked(status: Extract<ScoreStatus, { status: 'not_checked' }>): void {
  const card = make('div', 'card card--unknown');
  card.append(make('h2', 'card__headline', 'Could not check this link'));
  card.append(make('p', 'card__sentence', status.reason));

  if (status.localSignals.length > 0) {
    const count = status.localSignals.length;
    card.append(
      make('p', 'card__sentence', `Local checks spotted ${count} warning signal(s) in the address.`),
    );
  }

  resultBox.replaceChildren(card);
}

function makeCopyButton(url: string, tier: Tier, headline: string, sentences: string[]): HTMLButtonElement {
  const button = make('button', 'button-secondary', COPY_LABEL);
  button.type = 'button';

  button.addEventListener('click', async () => {
    const summary = `Link Guard: ${TIER_LABEL[tier]} — ${headline}\n${url}\n${sentences.join('\n')}`;
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(summary);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Could not copy';
    } finally {
      window.setTimeout(() => {
        button.textContent = COPY_LABEL;
        button.disabled = false;
      }, COPIED_LABEL_MS);
    }
  });

  return button;
}

function isScoreStatus(value: unknown): value is ScoreStatus {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return false;
  }
  const status = (value as { status: unknown }).status;
  return status === 'scored' || status === 'not_checked';
}

async function requestScore(payload: RedactedPayload): Promise<ScoreStatus> {
  try {
    const response: unknown = await chrome.runtime.sendMessage({ type: 'score', payload });
    if (isScoreStatus(response)) {
      return response;
    }
  } catch {
    return { status: 'not_checked', reason: UNREACHABLE_REASON, localSignals: [] };
  }
  return { status: 'not_checked', reason: UNREACHABLE_REASON, localSignals: [] };
}

async function checkLink(): Promise<void> {
  clearError();

  const raw = input.value;
  const url = safeExtractUrl(raw);
  if (!url) {
    setError('Paste a link first. If you pasted a message, make sure it contains a link.');
    return;
  }

  let analysis: Analysis;
  try {
    analysis = analyseUrl(url);
  } catch {
    setError('That link could not be read.');
    return;
  }

  if (!analysis.ok) {
    setError(analysis.reason);
    return;
  }

  renderChecking();
  checkButton.disabled = true;
  try {
    const payload = buildPayload(raw, analysis);
    const status = await requestScore(payload);
    if (status.status === 'scored') {
      renderScored(url, status);
    } else {
      renderNotChecked(status);
    }
  } finally {
    checkButton.disabled = false;
  }
}

function safeExtractUrl(raw: string): string | null {
  try {
    return extractFirstUrl(raw);
  } catch {
    return null;
  }
}

input.addEventListener('input', () => renderRedactionPreview(input.value));
checkButton.addEventListener('click', () => {
  void checkLink();
});
