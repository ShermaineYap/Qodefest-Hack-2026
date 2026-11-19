// End-to-end simulation: loads the extension into a throwaway Chromium, opens a fake
// WhatsApp Web chat full of links, and checks what a user would see.
//
//   npm run sim              headless, prints PASS/FAIL, exits 1 on any failure
//   npm run sim -- --headed  watch it happen in a visible window
//   npm run sim -- --live    score against the deployed gateway in src/config.ts (no mock)
//
// Nothing touches the real internet or a real chat account: web.whatsapp.com and every link
// target are served by Playwright, and scoring goes to scripts/mock-api.mjs on :4000.
// The extension is rebuilt into sim-output/dist with API_BASE pointed at the mock, so
// src/config.ts can point anywhere (e.g. the demo tunnel) without breaking the simulation.
// Screenshots land in sim-output/.

import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'sim-output');
const DIST = path.join(OUT, 'dist');
const MOCK_BASE = 'http://localhost:4000';
const HEADED = process.argv.includes('--headed');
// --live: keep API_BASE from src/config.ts (the deployed gateway) instead of the local mock.
const LIVE = process.argv.includes('--live');
// Real pages take a moment to load; an instant stub hides navigation races.
const LINK_LOAD_DELAY_MS = 1500;

const BADGE = { low: '🟢', medium: '🟡', high: '🔴', not_checked: '⚠︎' };

// [sender, message text, link, expected tier]
const CHAT = [
  ['Ali', 'Lunch at 1? menu here', 'https://www.google.com/maps/place/Nasi+Kandar', 'low'],
  ['Mak', 'Bank says update akaun', 'https://maybank2u-secure-login.xyz/login', 'high'],
  ['Unknown', 'You won RM500! claim', 'https://bit.ly/3xYzAbc', 'medium'],
  ['Unknown', 'Parcel held, verify', 'http://203.0.113.7/verify', 'high'],
  ['Kak Long', 'Real bank site', 'https://www.maybank2u.com.my/home/m2u/common/login.do', 'low'],
  ['Unknown', 'Login here', 'https://www.maybank2u.com.my@evil-site.top/login', 'high'],
  ['Unknown', 'PayPal limited', 'https://xn--pypal-4ve.com/signin', 'high'],
];
const LATE = ['Unknown', '(arrives later) Your account is locked', 'https://secure-maybank.login-verify.top/acc', 'high'];
const HIGH_LINK = CHAT[1][2];
const LOW_LINK = CHAT[0][2];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n      ${detail}` : ''}`);
}

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const bubble = ([who, text, url]) =>
  `<div class="message-in"><b>${escape(who)}</b><br>${escape(text)} <a href="${escape(url)}">${escape(url)}</a></div>`;
const CHAT_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>WhatsApp (simulated)</title><style>
body{font-family:system-ui;background:#efeae2;margin:0;padding:20px}
.message-in{background:#fff;margin:8px 0;padding:8px 12px;border-radius:8px;max-width:520px}
b{color:#128c7e}</style></head><body><h3>Family group (simulated WhatsApp Web)</h3>
<div id="chat">${CHAT.map(bubble).join('\n')}</div></body></html>`;

async function buildForSim() {
  // Same entry points as scripts/build.mjs, with API_BASE swapped for the local mock.
  const pointAtMock = {
    name: 'point-at-mock',
    setup(b) {
      b.onLoad({ filter: /src[\\/]config\.ts$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        const contents = source.replace(/export const API_BASE = .*;/, `export const API_BASE = '${MOCK_BASE}';`);
        if (contents === source) throw new Error('sim: could not find API_BASE in src/config.ts');
        return { contents, loader: 'ts' };
      });
    },
  };
  await rm(DIST, { recursive: true, force: true });
  for (const f of ['manifest.json', 'warning/warning.html', 'warning/warning.css', 'panel/panel.html', 'panel/panel.css']) {
    await mkdir(path.dirname(path.join(DIST, f)), { recursive: true });
    await cp(path.join(ROOT, 'src', f), path.join(DIST, f));
  }
  await build({
    absWorkingDir: ROOT,
    entryPoints: {
      background: 'src/background.ts',
      content: 'src/content.ts',
      'warning/warning': 'src/warning/warning.ts',
      'panel/panel': 'src/panel/panel.ts',
    },
    bundle: true,
    format: 'iife',
    target: 'chrome116',
    outdir: DIST,
    plugins: LIVE ? [] : [pointAtMock],
    logLevel: 'warning',
  });
}

async function startMock() {
  const mock = spawn(process.execPath, [path.join(ROOT, 'scripts', 'mock-api.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = [];
  mock.stdout.on('data', (d) => output.push(d.toString()));
  mock.stderr.on('data', (d) => output.push(d.toString()));
  for (let i = 0; i < 30; i++) {
    if (mock.exitCode !== null) throw new Error(`mock API exited:\n${output.join('')}`);
    try {
      if ((await fetch(`${MOCK_BASE}/health`)).ok) return mock;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  mock.kill();
  throw new Error(`mock API did not start on ${MOCK_BASE}:\n${output.join('')}`);
}

async function badgeFor(page, url) {
  return page.evaluate((href) => {
    const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href') === href);
    const badge = a?.parentElement?.querySelector('.lg-badge');
    return badge ? { glyph: badge.textContent, title: badge.title } : null;
  }, url);
}

async function waitForBadge(page, url, glyph, timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  let badge = null;
  while (Date.now() < until) {
    badge = await badgeFor(page, url);
    if (badge && badge.glyph === glyph) return badge;
    await page.waitForTimeout(200);
  }
  return badge;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await buildForSim();
  const mock = LIVE ? null : await startMock();
  const apiHost = LIVE ? new URL((await readFile(path.join(ROOT, 'src', 'config.ts'), 'utf8')).match(/API_BASE = '([^']+)'/)[1]).hostname : 'localhost';
  const profile = await mkdtemp(path.join(os.tmpdir(), 'link-guard-sim-'));
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', // the headless shell cannot run extensions
      headless: !HEADED,
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
      viewport: { width: 900, height: 720 },
    });
    await ctx.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.protocol.startsWith('http') || url.hostname === 'localhost' || url.hostname === apiHost) return route.continue();
      if (url.hostname === 'web.whatsapp.com') return route.fulfill({ contentType: 'text/html', body: CHAT_HTML });
      await new Promise((r) => setTimeout(r, LINK_LOAD_DELAY_MS));
      return route.fulfill({ contentType: 'text/html', body: `<h1>Stub page for ${escape(url.href)}</h1>` });
    });

    const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10000 }));
    const extId = new URL(worker.url()).host;
    console.log(`Extension loaded (${extId}); scoring against ${LIVE ? `the live gateway (${apiHost})` : `the mock on ${MOCK_BASE}`}\n`);

    // 1. Badges in the chat
    const page = await ctx.newPage();
    await page.goto('https://web.whatsapp.com/');
    for (const [, , url, tier] of CHAT) {
      const badge = await waitForBadge(page, url, BADGE[tier]);
      check(`badge ${BADGE[tier]} on ${url}`, badge?.glyph === BADGE[tier], badge ? `got ${badge.glyph} "${badge.title}"` : 'no badge');
    }

    // 2. A message that arrives after the page loaded
    await page.evaluate((html) => document.getElementById('chat').insertAdjacentHTML('beforeend', html), bubble(LATE));
    const late = await waitForBadge(page, LATE[2], BADGE[LATE[3]]);
    check('new message gets a badge', late?.glyph === BADGE[LATE[3]], late ? `got ${late.glyph}` : 'no badge');
    await page.screenshot({ path: path.join(OUT, '1-chat.png'), fullPage: true });

    // 3. Clicking a high-risk link shows the warning page
    await page.click(`a[href="${HIGH_LINK}"]`);
    await page.waitForURL(/warning\.html|maybank2u-secure-login/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(LINK_LOAD_DELAY_MS + 1000);
    const onWarning = page.url().includes('/warning/warning.html');
    check('clicking a 🔴 link opens the warning page', onWarning, `tab is at ${page.url()}`);
    await page.screenshot({ path: path.join(OUT, '2-after-high-click.png'), fullPage: true });

    if (onWarning) {
      const headline = await page.innerText('#headline');
      check('warning page shows the verdict', !/did not finish|may be a scam/i.test(headline) && headline.length > 0, `headline: "${headline}"`);
      await page.click('#back');
      await page.waitForURL('https://web.whatsapp.com/', { timeout: 5000 }).catch(() => {});
      check('"Go back to safety" returns to the chat', page.url() === 'https://web.whatsapp.com/', `tab is at ${page.url()}`);
    } else {
      await page.goto('https://web.whatsapp.com/');
    }

    // 4. A safe link opens normally
    await waitForBadge(page, LOW_LINK, BADGE.low);
    await page.click(`a[href="${LOW_LINK}"]`);
    await page.waitForTimeout(LINK_LOAD_DELAY_MS + 1000);
    check('clicking a 🟢 link opens it with no warning', page.url() === LOW_LINK, `tab is at ${page.url()}`);

    // 5. Browsing outside the chat: a scam site typed into the address bar, and one clicked on
    //    an ordinary website. Both must hit the warning page; a normal site must not.
    const browse = await ctx.newPage();
    await browse.goto('https://www.maybank2u.com.my@evil-site.top/login').catch(() => {});
    await browse.waitForTimeout(LINK_LOAD_DELAY_MS + 1000);
    check('a 🔴 site typed into the address bar gets the warning page', browse.url().includes('/warning/warning.html'), `tab is at ${browse.url()}`);

    await browse.goto('https://news.example.com/').catch(() => {});
    await browse.waitForTimeout(LINK_LOAD_DELAY_MS + 500);
    check('an ordinary site opens with no warning', browse.url() === 'https://news.example.com/', `tab is at ${browse.url()}`);
    await browse.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<a id="ad" href="https://secure-maybank.login-verify.top/acc">Claim your bank reward</a>');
    });
    await browse.click('#ad');
    await browse.waitForTimeout(LINK_LOAD_DELAY_MS + 1000);
    check('a 🔴 link clicked on another website gets the warning page', browse.url().includes('/warning/warning.html'), `tab is at ${browse.url()}`);
    await browse.screenshot({ path: path.join(OUT, '3-browsing-warning.png'), fullPage: true });

    // 6. The side panel's paste-a-link check
    const panel = await ctx.newPage();
    await panel.goto(`chrome-extension://${extId}/panel/panel.html`);
    await panel.fill('#input', `Mak: tolong check ${HIGH_LINK}`);
    await panel.click('#check');
    await panel.waitForFunction(() => document.getElementById('result')?.innerText.trim().length > 0, null, { timeout: 10000 }).catch(() => {});
    const panelText = (await panel.innerText('#result')).trim();
    check('side panel check flags the pasted scam link', /scam/i.test(panelText), `result: "${panelText.split('\n')[0] ?? ''}"`);
    await panel.screenshot({ path: path.join(OUT, '4-panel.png'), fullPage: true });
  } finally {
    await ctx?.close();
    mock?.kill();
    await rm(profile, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots in sim-output/.`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
