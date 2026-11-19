import type { ScoreStatus } from '../messages.ts';

type Scored = Extract<ScoreStatus, { status: 'scored' }>;

const url = new URLSearchParams(location.search).get('u') ?? '';

function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname || raw;
  } catch {
    return raw;
  }
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing element #${id}`);
  }
  return element;
}

const headline = byId('headline');
const sentence = byId('sentence');
const domain = byId('domain');
const evidence = byId('evidence');
const checked = byId('checked');
const requestId = byId('request-id');
const back = byId('back');
const continueLink = byId('continue');

function isScored(value: unknown): value is Scored {
  if (typeof value !== 'object' || value === null || !('status' in value) || !('result' in value)) {
    return false;
  }
  const candidate = value as { status: unknown; result: unknown };
  return (
    candidate.status === 'scored' &&
    typeof candidate.result === 'object' &&
    candidate.result !== null
  );
}

domain.textContent = hostOf(url);

function applyResult(response: Scored): void {
  const result = response.result;
  if (result.headline.length > 0) {
    headline.textContent = result.headline;
  }
  const [first, ...rest] = result.sentences;
  if (first !== undefined) {
    sentence.textContent = first;
  }
  if (rest.length > 0) {
    const items = rest.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    });
    evidence.replaceChildren(...items);
    evidence.hidden = false;
  }
  if (result.checked.length > 0) {
    checked.textContent = result.checked.join(', ');
  }
  if (result.requestId.length > 0) {
    requestId.textContent = result.requestId;
  }
}

chrome.runtime.sendMessage({ type: 'get-verdict', url }, (response: unknown) => {
  if (chrome.runtime.lastError !== undefined) {
    return;
  }
  if (isScored(response)) {
    applyResult(response);
  }
});

back.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'go-back' });
});

continueLink.addEventListener('click', (event: MouseEvent) => {
  event.preventDefault();
  if (url.length === 0) {
    return;
  }
  chrome.runtime.sendMessage({ type: 'continue', url });
});
