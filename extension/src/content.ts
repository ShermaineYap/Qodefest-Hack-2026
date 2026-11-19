import { matchSite } from './selectors.ts';
import type { SiteConfig } from './selectors.ts';
import { TIER_RANK } from './messages.ts';
import type { ExtensionMessage, ScoreStatus, Tier } from './messages.ts';
import { analyseUrl } from './link.ts';
import { buildPayload } from './redact.ts';

type BadgeTier = Tier | 'not_checked';

interface BadgeView {
  glyph: string;
  title: string;
}

const BADGE_VIEWS: Record<BadgeTier, BadgeView> = {
  low: { glyph: '🟢', title: 'Nothing unusual about this link.' },
  medium: { glyph: '🟡', title: 'This link looks off. Open it only if you were expecting it.' },
  high: { glyph: '🔴', title: 'This looks like a scam link. Do not enter your password or bank details.' },
  not_checked: { glyph: '⚠︎', title: 'Could not check this link. Treat it as unverified.' },
};

const PENDING_VIEW: BadgeView = { glyph: '⋯', title: 'Checking this link…' };
const RESCAN_DEBOUNCE_MS = 400;
const RESCAN_INTERVAL_MS = 3000;
const EMPTY_ROOTS_WARN_MS = 15000;
const MAX_ANCESTOR_HOPS = 4000;

const STYLE_TEXT = `
.lg-badge {
  display: inline-block;
  margin-left: 4px;
  font-size: 13px;
  line-height: 1;
  cursor: help;
  vertical-align: baseline;
}
.lg-notice {
  position: fixed;
  right: 16px;
  bottom: 16px;
  padding: 10px 14px;
  background: #1f2328;
  color: #ffffff;
  font-size: 13px;
  line-height: 1.4;
  border-radius: 8px;
  max-width: 280px;
  z-index: 2147483647;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
`;

const TIER_DOM_ORDER: readonly Tier[] = ['low', 'medium', 'high'];
const TIER_SET: ReadonlySet<string> = new Set<string>(TIER_DOM_ORDER);

const annotated = new WeakSet<HTMLAnchorElement>();
const hrefStatus = new Map<string, BadgeTier>();
const hrefBadges = new Map<string, Set<HTMLSpanElement>>();
const inFlight = new Set<string>();
const notifiedRoots = new WeakSet<Element>();

let noticeShown = false;
let debounceTimer: number | undefined;
let scheduled = false;

function parseHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function parseElementHref(element: Element): string | null {
  const raw = element.getAttribute('href');
  if (raw === null) return null;
  return parseHttpUrl(raw) === null ? null : raw;
}

function applyView(badge: HTMLSpanElement, view: BadgeView, tier: string): void {
  badge.textContent = view.glyph;
  badge.title = view.title;
  badge.setAttribute('aria-label', view.title);
  badge.dataset.tier = tier;
}

function renderHref(href: string): void {
  const badges = hrefBadges.get(href);
  if (badges === undefined) return;
  const tier = hrefStatus.get(href);
  const view = tier === undefined ? PENDING_VIEW : BADGE_VIEWS[tier];
  const domTier = tier ?? 'pending';
  for (const badge of badges) {
    if (!badge.isConnected) {
      badges.delete(badge);
      continue;
    }
    try {
      applyView(badge, view, domTier);
    } catch {
      /* a detached or locked node must not stop the rest */
    }
  }
}

async function scoreHref(href: string): Promise<void> {
  if (inFlight.has(href) || hrefStatus.has(href)) return;
  inFlight.add(href);

  let payload: ReturnType<typeof buildPayload> | null = null;
  let localScore = 0;
  try {
    const analysis = analyseUrl(href);
    if (analysis.ok) {
      payload = buildPayload(href, analysis);
      localScore = analysis.localScore;
    }
  } catch {
    payload = null;
  }

  if (payload === null) {
    mergeStatus(href, 'not_checked');
    inFlight.delete(href);
    return;
  }

  const message: ExtensionMessage = { type: 'score', payload, localScore };

  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    mergeStatus(href, readStatus(response));
  } catch {
    mergeStatus(href, 'not_checked');
  } finally {
    inFlight.delete(href);
    renderHref(href);
  }
}

function readStatus(response: unknown): BadgeTier {
  if (typeof response !== 'object' || response === null) return 'not_checked';
  const candidate = response as Partial<ScoreStatus>;
  if (candidate.status === 'scored') {
    const result = (candidate as Extract<ScoreStatus, { status: 'scored' }>).result;
    if (typeof result !== 'object' || result === null) return 'not_checked';
    const tier: unknown = result.tier;
    return typeof tier === 'string' && TIER_SET.has(tier) ? (tier as Tier) : 'not_checked';
  }
  if (candidate.status === 'not_checked') return 'not_checked';
  return 'not_checked';
}

function mergeStatus(href: string, incoming: BadgeTier): void {
  const current = hrefStatus.get(href);
  if (current === 'high' || current === 'not_checked') return;
  if (current !== undefined && incoming === 'not_checked') return;
  if (current !== undefined && TIER_RANK[incoming as Tier] < TIER_RANK[current]) return;
  hrefStatus.set(href, incoming);
  renderHref(href);
}

function annotate(anchor: HTMLAnchorElement, href: string): void {
  const badge = document.createElement('span');
  badge.className = 'lg-badge';
  badge.setAttribute('role', 'img');
  applyView(badge, PENDING_VIEW, 'pending');

  try {
    anchor.insertAdjacentElement('afterend', badge);
  } catch {
    return;
  }

  annotated.add(anchor);
  let badges = hrefBadges.get(href);
  if (badges === undefined) {
    badges = new Set<HTMLSpanElement>();
    hrefBadges.set(href, badges);
  }
  badges.add(badge);

  const known = hrefStatus.get(href);
  if (known !== undefined) {
    renderHref(href);
    return;
  }
  void scoreHref(href);
}

function scanRoot(root: Element): void {
  let anchors: NodeListOf<HTMLAnchorElement>;
  try {
    anchors = root.querySelectorAll<HTMLAnchorElement>('a[href]');
  } catch {
    return;
  }

  const fresh: Array<[HTMLAnchorElement, string]> = [];
  for (const anchor of Array.from(anchors)) {
    if (annotated.has(anchor)) continue;
    const href = parseElementHref(anchor);
    if (href === null) {
      annotated.add(anchor);
      continue;
    }
    fresh.push([anchor, href]);
  }

  for (const [anchor, href] of fresh) {
    try {
      annotate(anchor, href);
    } catch {
      /* one malformed anchor must not break the scan */
    }
  }
}

function collectRoots(site: SiteConfig): Element[] {
  const roots: Element[] = [];
  const seen = new Set<Element>();
  const add = (element: Element): void => {
    for (const root of roots) {
      if (root === element || root.contains(element)) return;
    }
    if (!seen.has(element)) {
      seen.add(element);
      roots.push(element);
    }
  };

  try {
    const matched = document.querySelectorAll(site.messageSelector);
    for (const element of Array.from(matched)) {
      if (element.querySelector('a[href]') === null) {
        const parent = element.parentElement;
        if (parent !== null) {
          add(parent);
          continue;
        }
      }
      add(element);
    }
  } catch {
    /* an invalid selector must not stop the interval */
  }

  return roots;
}

function ensureStyles(): void {
  if (document.getElementById('lg-style') !== null) return;
  const style = document.createElement('style');
  style.id = 'lg-style';
  style.textContent = STYLE_TEXT;
  (document.head ?? document.documentElement).append(style);
}

function showNotice(site: SiteConfig): void {
  if (noticeShown) return;
  noticeShown = true;
  console.warn(`[Link Guard] Could not read ${site.label}: zero message containers matched ${site.messageSelector}.`);
  try {
    const notice = document.createElement('div');
    notice.className = 'lg-notice';
    notice.textContent = `Link Guard could not read ${site.label}. Links here are not checked.`;
    document.body.append(notice);
  } catch {
    /* the page may not allow a body yet */
  }
}

function depth(element: Element): number {
  let hops = 0;
  let node: Element | null = element;
  while (node !== null && hops < MAX_ANCESTOR_HOPS) {
    node = node.parentElement;
    hops += 1;
  }
  return hops;
}

function runPass(site: SiteConfig): void {
  scheduled = false;
  const roots = collectRoots(site);
  if (roots.length === 0) return;

  const pending = roots.filter((root) => !notifiedRoots.has(root));
  if (pending.length > 0) {
    pending.sort((a, b) => depth(a) - depth(b));
    for (const root of pending) {
      notifiedRoots.add(root);
      scanRoot(root);
    }
    return;
  }

  for (const root of roots) scanRoot(root);
}

function schedulePass(site: SiteConfig): void {
  if (scheduled) return;
  scheduled = true;
  if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    runPass(site);
  }, RESCAN_DEBOUNCE_MS);
}

function start(site: SiteConfig): void {
  ensureStyles();
  runPass(site);

  const observed = document.body ?? document.documentElement;
  const observer = new MutationObserver(() => {
    schedulePass(site);
  });
  observer.observe(observed, { childList: true, subtree: true });

  window.setInterval(() => {
    runPass(site);
  }, RESCAN_INTERVAL_MS);

  window.setTimeout(() => {
    if (collectRoots(site).length === 0) showNotice(site);
  }, EMPTY_ROOTS_WARN_MS);
}

const site = matchSite(location.hostname);
if (site !== null) start(site);
