# Qodefest Hack 2026 · Lantern

**A browser extension that reads the link before she does — and an agentic chat box that explains what it found.**

Chrome Manifest V3 · TypeScript · on-device redaction · enclave scoring · bounded AI agent

Team **Pattaya Fried Rice** · williamkee51 · Shermaine Yap · Fahreza Alghifari · Fihkri · Qodefest Hack 2026

---

## What we are building

Two surfaces, one detection pipeline:

| Surface | What it does |
|---|---|
| **Passive link guard** | Finds links in the conversation the user is already in, scores each one before it is opened, and marks it 🟢 / 🟡 / 🔴 in place. |
| **Warning interstitial** | Replaces a HIGH-risk top-level navigation with a calm page that says what is wrong and makes "go back" the easy choice. |
| **Assistant panel** | A side panel where the user can paste a link or a message and ask whether it is a scam. A bounded agent uses a small set of tools, shows what it checked, and recommends one next step. |

The guard is passive: no copy-pasting, no button to press. The assistant is active: for the moments when she wants a second opinion, or when the link arrived somewhere the extension cannot see.

**Not in v1:** autonomous browsing, form filling or payments; automatic reports to banks or authorities; stored browsing history; wallet signing from the panel; native-app, QR-code or in-app-browser coverage.

---

## The problem

- **95% of online fraud is "authorised".** Bank Negara Malaysia reports that the overwhelming majority of cases involve victims approving the transfer themselves. The stolen credential is not the attack; the manipulated decision is.
- **The link is the delivery mechanism.** Fake bank logins, parcel-fee scams, investment pitches and account-takeover flows arrive as a URL in WhatsApp or Telegram. The chat carries the pressure; the link carries the theft.
- **Older adults absorb a disproportionate share of the loss** — under 10% of victims but nearly 28% of total scam losses, including over RM1.47B in investment scams alone, coordinated mainly through chat apps.
- **Blocklists are necessary and late.** A newly registered lookalike domain can be live and convincing for hours before any feed catches it. The conversation that delivered it is visible immediately, and that context is what a plain blocklist throws away.

**Why not just Safe Browsing?** Keep it — a blocklist hit is a hard HIGH. But a blocklist cannot explain *why*, cannot use the conversation that delivered the link, and cannot slow a decision down without the red page people have been trained to click through. Lantern adds context, explanation and consequence.

---

## What the user sees

### Inline badge

| Tier | Badge | What she is told |
|---|---|---|
| LOW | 🟢 | "Nothing unusual about this link." |
| MEDIUM | 🟡 | "This link looks off. Open it only if you were expecting it." |
| HIGH | 🔴 | "This looks like a scam link. Do not enter your password or bank details." |
| PENDING | ⋯ | "Checking this link…" |
| NOT CHECKED | ⚠︎ | "Could not check this link." — never green |

A clean link gets a badge too. An indicator that appears only on danger is indistinguishable from one that is broken.

### Warning page

```
⚠️  This link may be a scam

It asks for your Maybank login, but it is not maybank.com.my.

    🔴  maybank-secure-login.xyz

Someone you trust can help you check it first.

[  Go back to safety  ]        Continue anyway
```

- **Back is the default and the visually dominant action.** Continue is plain text, never pre-selected, never on a countdown.
- **Consequences, not mechanics.** "It asks for your bank login, but it is not your bank" beats "brand-token mismatch".
- **HIGH interrupts; MEDIUM annotates.** A page that blocks every amber link trains her to click through all of them.

### Assistant panel

```
┌──────────────────────────────────────────────────┐
│  Lantern Assistant                               │
│                                                  │
│  You: is this link safe?                         │
│       maybank-secure-login.xyz/login             │
│                                                  │
│  Lantern: 🔴 Likely a scam                       │
│                                                  │
│  • The address is not maybank.com.my             │
│  • The page asks for your bank login             │
│  • The domain was registered 4 days ago          │
│                                                  │
│  What I checked: domain, redirects, age,         │
│  login form. Request id: req_…                   │
│                                                  │
│  [ Go back to safety ]  [ Ask someone I trust ]  │
└──────────────────────────────────────────────────┘
```

The panel answers with **evidence**, not prose. Every verdict carries what was checked, what could not be checked, and one primary action. If the backend is unreachable it says **"not checked"**; it never invents a green.

---

## How it works

```
WhatsApp Web / Telegram / Messenger / any tab / side panel
        │
        │  anchors on screen, or a pasted link
        ▼
1. discover + normalise            on this device: parse URL, lowercase host,
                                   punycode → unicode, detect mixed scripts
        │  host · coarse path shape · redaction counts   (nothing else)
        ▼
2. service worker                  the ONLY network surface
        │
        ▼
3. API gateway :4000               transport only — no text, no verdicts
        │
        ▼
4. enclave :3100                   redact again · deterministic URL rules
                                   classifier + skeptical verifier
                                   code fuses · hard floors hold
        │  tier · risk score · category · request ids
        ▼
🟢/🟡/🔴 inline badge  ·  warning page  ·  assistant panel
```

### 1. Discover

A content script finds anchors in the conversation panel and annotates them in place. A narrower hook checks top-level `http(s)` navigations so a link opened from SMS, email or the address bar is covered too. The panel accepts a pasted URL or message. None of these surfaces holds credentials or service URLs.

### 2. Normalise and redact on-device

The URL is reduced to what scoring needs:

- **Kept:** scheme, registrable domain, TLD, label shapes, IP-literal flag, subdomain count, punycode/mixed-script flags, userinfo presence, a coarse path shape (`/login`, `/verify`, `/claim`).
- **Dropped or hashed:** query string, fragment, path parameters, emails, phone numbers, NRIC, card, bank account and wallet addresses.

Keeping the domain is deliberate: a lookalike domain is itself evidence. The same redaction module runs again on arrival, so a stale or bypassed extension cannot leak raw data.

### 3. Deterministic URL rules

This layer always runs, is explainable, and is unit-tested. It is why an obvious phish is still caught when both models time out.

| Signal | Effect |
|---|---|
| Deny-list hit | hard floor **95** |
| Brand token outside the registrable domain | hard floor **85** |
| Credential-harvest path + brand impersonation | hard floor **80** |
| Punycode, mixed-script or homoglyph host | hard floor **80** |
| Userinfo obfuscation (`https://maybank.com.my@evil.xyz`) | floor **70** |
| IP-literal host, or a login form on a non-HTTPS origin | floor **60** |
| Shortener or open redirect with no visible destination | floor **45**, expand and re-score |
| Excessive subdomains / hyphens / suspicious TLD | +20–35 |
| Domain first seen recently | +20 |

### 4. Private scoring

The deterministic verdict is a floor, never a ceiling. Inside an isolated scoring service, a classifier model and a skeptical cross-verifier each see the redacted facts and the rule hits. The verifier is explicitly asked for the innocent explanation, because real life contains urgent messages, real bills and real family.

Code owns the number:

- A model that fails or returns unparseable JSON **drops out**; it is never counted as a vote for LOW.
- Hard floors cannot be lowered by either model.
- If no model answers but the deterministic score is non-trivial, the verdict is raised to MEDIUM and marked **held for review**.
- Model reasoning is checked for quoted content before it leaves the service.

### 5. Bounded agent

The assistant is not a wrapper around one model call. It is a loop with a hard budget:

- ≤ 3 tool calls, ≤ 2 model calls, ≤ 12s per turn, then answer with what is known.
- Tools are server-side and allowlisted: `score_url`, `expand_url` (≤ 5 redirects, no cookies, no referrer), `domain_reputation` (deny list, age, TLS certificate), `score_message` (deterministic lexicons + model fusion).
- Every claim in the answer maps to a tool result; the UI shows the evidence ledger.
- Tool output and any pasted content are `UNTRUSTED_DATA` — instructions inside are never followed.
- Thin evidence → MEDIUM or NOT CHECKED plus a next step, never a confident LOW.
- No transcript persistence; memory only, clear wipes it.

Page-content inspection (forms, brand assets, screenshots) is deliberately **v1.1**, not v1: it adds SSRF, prompt-injection and privacy surface for marginal demo gain.

---

## Design rules we will not break

**Redaction happens in the content script, not the worker.** Identifying values do not cross the network because they do not survive that file; the backend redacts again.

**The service worker is the only network surface.** A fetch from a content script carries the page's origin; a fetch from the worker carries `chrome-extension://<id>`, which the backend's narrow allow-list admits. A compromised page can ask the worker to score a link — that is the whole surface.

**Fail closed means "not checked", never LOW.** If the backend is unreachable, every surface says so and no verdict is invented.

**Worst verdict wins, not the newest.** A scammer who turns friendly before sending the link cannot walk the badge back to green in the seconds that matter.

**Nothing is written to disk.** No browsing history, no flagged-link log, no transcript. A record of what has been trying to scam her is useful to exactly one other party.

**The warning is a speed bump, not a wall.** HIGH interrupts once and explains why; MEDIUM annotates and gets out of the way.

**No model may upgrade a verdict to LOW.** Models supply evidence; code owns the threshold.

**Selectors are isolated per site.** Chat markup is obfuscated and changes without notice. Selectors live in one table, pinned by fixture tests, and a broken read is reported rather than shown as green.

---

## Trust boundary

| Leaves the device | Never leaves the device |
|---|---|
| Registrable domain + TLD | Full URL with query string |
| Coarse path shape (`/login`, `/claim`) | Page text, chat text, cookies |
| Structural features (IP literal, subdomain count, punycode) | Email, phone, NRIC, card, account, wallet address |
| Hashed session id `sha256(host \| thread)` | Contact names, phone numbers, thread titles |
| Tier, score, pattern names, request ids | Browsing history, click history, verdict log |

---

## Status

This repository is the main workspace for Qodefest Hack 2026. The extension is scaffolded (T-033), the scoring API `/risk/link` is deployed and live behind a Cloudflare quick tunnel (contract v0.1 in [`server/README.md`](server/README.md)), the gateway's `POST /agent/message` returns a model-backed scam verdict (mock until a key is set), and Ask SHOU v1 lives in `server/index.ts` (Vercel/local, not yet in the Docker stack).

| Area | State |
|---|---|
| Product spec, threat model, trust boundary | This README |
| Extension scaffold + assistant panel | Scaffolded (T-033); needs manual Chrome test |
| URL normaliser + deterministic rules | Done (extension on-device; server re-derives from flags) |
| Warning interstitial + navigation hook | Scaffolded; needs manual Chrome test |
| `/risk/link` | Live at the current tunnel host — see `server/README.md` |
| Agent endpoint | `POST /agent/message` on the gateway checks text and/or a screenshot with an OpenAI-compatible model and returns `scam` \| `not_scam` \| `unsure` + reply; it also fingerprints the message against the stored log and labels a scam `new_scam` or `known_scam` (with the first-seen time); stored in SQLite; keyword mock until `LLM_API_KEY` is set. Ask SHOU v1 in `server/index.ts` (not in the compose stack yet) |
| Dashboard | Read-only message-log viewer at the tunnel root (`dashboard/`), Beautiful UI primitives, no auth |
| Eval set and gate | Not started |

---

## Roadmap

| Milestone | Outcome |
|---|---|
| **M0** | Lock decisions: side panel, URL-only v1, memory-only transcripts, budgets, ownership split. |
| **M1** | Thin slice: panel shell, one `score_url` call, redaction preview, every state including NOT CHECKED. |
| **M2** | Bounded loop: agent endpoint with streaming, tool allowlist, evidence ledger, short cache. |
| **M3** | Hardening: prompt injection, SSRF guard, sanitised rendering, no persistence, rate limit, kill switch. |
| **M4** | Senior UX: grade-6 copy, voice in EN/MS, one primary action, usability test with 3 older adults. |
| **M5** | Evals and demo: 60 fixtures; gate is 0 HIGH on 20 legitimate URLs and ≥ 90% of known phish at HIGH, p95 ≤ 8s; three-act demo including the backend-down honesty case. |

---

## Working together

Read [`team/README.md`](team/README.md) first. Roles, timeline, backlog, decisions and session logs live in `team/`;
every agent follows [`.qoder/rules/team-harness.md`](.qoder/rules/team-harness.md).

## Repository layout

```
Qodefest-Hack-2026/
├── README.md
├── extension/            Chrome MV3 extension
│   └── src/
│       ├── content.ts        reads links, redacts on-device, badges
│       ├── background.ts     service worker — only network surface
│       ├── link.ts           URL normaliser + deterministic rules
│       ├── warning/          interstitial + navigation hook
│       └── panel/            assistant side panel
├── server/               gateway + enclave (Python, compose), Ask SHOU (TS)
├── dashboard/            Next.js message-log dashboard served at /
├── eval/                 fixtures, harness, metrics                    [planned]
└── docs/                 decisions, runbook, eval notes
```

Paths marked `[planned]` do not exist yet. The README describes the target shape so the first commits have somewhere to land.

---

## Getting started

```bash
git clone https://github.com/ShermaineYap/Qodefest-Hack-2026.git
cd Qodefest-Hack-2026
node --version    # Node 22+
```

The extension builds with Node 22.6+. The Python gateway/enclave run instructions and the current
tunnel host live in [`server/README.md`](server/README.md). Do not commit build output, `.env` files
or the team server key.

---

## Demo runbook

Verified against `main` on 2026-11-19. For the presenting laptop.

### Setup (10 minutes)

1. Build the extension:

   ```bash
   cd extension
   npm install
   npm run build
   ```

2. Use a fresh Chrome profile, so no other extensions or personal tabs show. Open
   `chrome://extensions`, turn on Developer mode, **Load unpacked** → `extension/dist`, and pin the
   Lantern icon.
3. Check the gateway: `curl <API_BASE>/health` returns `{"status":"ok"}`. `API_BASE` lives in
   `extension/src/config.ts`. The Cloudflare quick-tunnel host changes whenever it restarts — refresh
   it from [`server/README.md`](server/README.md) ("Deployment"), update `config.ts`, rebuild.
4. Optional sanity checks: `npm test` at the repo root (21 tests), `cd extension && npm test` (29),
   `cd extension && npm run sim`, and the enclave's `pytest` (11, see `server/README.md`).
   The sim loads the built extension into a throwaway Chromium, opens a fake WhatsApp Web chat and
   checks every badge; `-- --headed` watches it happen, `-- --live` scores against the deployed
   gateway instead of its mock. It touches no real account or website.

### The demo (~2 minutes)

**Browsing.** Type `maybank2u-secure-login.xyz/login` into the address bar. The warning page appears
instead of the fake site: on-device brand rules floor the link at 85, so the verdict is HIGH even
when the gateway alone would score it lower. Press **Go back to safety**, then open a normal site to
show nothing gets in the way. The gateway must answer for the warning to appear; if it does not, the
extension shows NOT CHECKED instead of warning (fail closed).

**The side panel.** Click the Lantern icon and paste a whole scam SMS. The panel sends the text to
the gateway's `/agent/message` on the same tunnel as `/risk/link` (D-014) and shows the verdict, the
reasons and what was checked. A screenshot can be pasted, dropped or attached. The server answers
from a keyword mock when no model key is set, which is fine for the demo. A pasted link still goes
through the badge pipeline and shows "What leaves this device" (the redacted payload preview).

**The chat badges (only with a ready WhatsApp Web account).** A teammate sends the fake Maybank link
from their phone and a 🔴 badge appears in the chat before anyone clicks; the real Maybank link shows
🟢. Content scripts match `web.whatsapp.com`, `web.telegram.org` and `www.messenger.com`. Badge
behaviour has only been checked against fixtures so far — rehearse on the real WhatsApp Web first.

### If something goes wrong

- **Gateway down or no internet:** run the gateway and enclave locally (`server/README.md`, "Local
  development"), set `API_BASE = 'http://localhost:4000'`, rebuild.
- **No backend at all:** `cd extension && npm run mock-api` serves canned verdicts on `:4000`; point
  `API_BASE` there and rebuild. The warning page still fires because the on-device brand floor is
  HIGH.
- **Assistant offline:** the panel and link checks share `API_BASE`, so the gateway fix above covers
  both. The standalone Ask SHOU demo (`npm start`, `:8787`) is a separate app and is not called by
  the extension.
- **Laptop trouble:** a screen recording of a good run, made the night before.

---

## Team environment

> Private repository only. Do not copy this section into a public fork.

- Ubuntu 24.04 team server, shared `team` account with passwordless sudo.
- Key-only SSH:

  ```bash
  ssh -i ~/.ssh/id_ed25519 team@172.104.41.120
  ```

- The box is currently bare: only SSH is exposed; no services, containers or data are deployed yet.

---

## Team

1. **williamkee51**
2. **Shermaine Yap**
3. **Fahreza Alghifari**
4. **Fihkri**

Qodefest Hack 2026
