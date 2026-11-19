# Lantern — live demo script

Verified on 2026-11-19 against `main` and the live tunnel. Every expected badge below was produced
by the on-device rules plus the deployed `/risk/link` (server score shown). Assistant replies were
produced by the gateway's keyword mock (D-013), which is what the server answers when no model key
is configured.

## Safety rules

- **Never demo with a live phishing site.** All "scam" links here are fabricated lookalike domains
  built to hit our deterministic rules. Each was checked on 2026-11-19 and does not resolve, so even
  a mis-click loads nothing.
- One real-registered lookalike (`xn--pypal-4ve.com`) was found during prep and is excluded. The
  safe substitute is `xn--mybank-3nf.com` — "Maybank" with a Cyrillic `а`.
- **Do not press "Continue anyway" in front of an audience** unless you have separately checked what
  is at the destination. The warning page renders before any request is made, so the demo never
  needs the fake site to exist.
- For research on real phishing, use PhishTank / OpenPhish exports offline. Do not click them.

## Before the demo (5 minutes)

1. `git pull --rebase`, then `cd extension && npm install && npm run build`, and load
   `extension/dist` in a fresh Chrome profile.
2. `curl <API_BASE>/health` returns `{"status":"ok"}`.
3. Check the assistant path:

   ```bash
   curl -s -X POST <API_BASE>/agent/message -H 'Content-Type: application/json' \
     -d '{"v":1,"client":"preflight","kind":"chat","text":"Your account is suspended. Verify now."}'
   ```

   `201` means the model (or its mock) answers. A `503 {"detail":"agent_unavailable"}` means the
   deployed model is failing — use the local gateway below, or ask Fahreza to fix the key (T-048).
   With 503 the panel honestly shows NOT CHECKED, which is not the demo you want.
4. `cd extension && npm run sim` — expect the 15 badge and warning checks to pass. Setup once:
   `npm install && npx playwright install chromium`. Two known issues: the side-panel leg times out
   because the chat redesign removed `#result` (T-050), and the sim's mock treats userinfo and
   insecure-login as HIGH while live `/risk/link` gives 70 and 60 (MEDIUM) — trust this document for
   those rows (T-049).

## Act 1 — the warning page (address bar, ~60 s)

Only HIGH interrupts a top-level navigation, so this act uses HIGH links. Type the address and press
Enter; the warning replaces the page before it loads.

| Type into the address bar | Expected | Score | Rule that fires |
|---|---|---|---|
| `maybank2u-secure-login.xyz/login` | warning page, HIGH | 85 | brand impersonation + credential harvest |
| `maybank-secure-login.xyz/login` | warning page, HIGH | 95 | deny list |
| `secure-cimb.com/login` | warning page, HIGH | 85 | brand impersonation + credential harvest |
| `poslaju.com.my.track-parcel.top/track` | warning page, HIGH | 85 | brand hidden in the subdomain |
| `xn--mybank-3nf.com/login` | warning page, HIGH | 80 | lookalike (punycode) characters |
| `www.maybank2u.com.my` | opens normally, no interruption | 0 | nothing suspicious |

Talk track: "It knew before the page loaded, and it never fetched the site — the decision came from
the address alone." Point at the layout: **Go back to safety** is filled and focused; **Continue
anyway** is plain text, has no countdown, and is never pre-selected. Press Go back.

MEDIUM links do not interrupt navigation by design — HIGH interrupts, MEDIUM annotates. Demo amber
links in the panel or the chat instead.

## Act 2 — chat badges (WhatsApp Web, ~90 s)

Have a teammate send these from their phone while the demo profile has WhatsApp Web open. Badges
appear in place; each starts as ⋯ and resolves to its tier without anyone clicking.

| Sender says | Expected badge | Score |
|---|---|---|
| Lunch at 1? Menu here: `https://www.google.com/maps/place/KLCC` | 🟢 LOW | 0 |
| Bank says update akaun: `https://maybank2u-secure-login.xyz/login` | 🔴 HIGH | 85 |
| You won RM500! claim here: `https://shopee-my-reward.xyz/claim` | 🔴 HIGH | 85 |
| Real bank site: `https://www.maybank2u.com.my/home/m2u/common/login.do` | 🟢 LOW | 0 |
| Parcel held, verify: `http://203.0.113.7/verify` | 🟡 MEDIUM | 60 |
| Login here: `https://www.maybank2u.com.my@evil-site.top/login` | 🟡 MEDIUM | 70 |

Order it green → red → green → amber so the contrast is obvious. The last row is the best teaching
moment: the address *starts with* the real bank's name, but everything after `@` is where it goes.

Badge selectors have only been exercised against the simulation, not a live account — do one dry run
before the audience (T-043). Content scripts match `web.whatsapp.com`, `web.telegram.org` and
`www.messenger.com`.

## Act 3 — the assistant panel (side panel, ~90 s)

Open the side panel. Paste each message; a message with a link gets a badge card and an
**Ask Lantern Assistant to explain** button. Replies below are the verified mock output.

| Paste this | Link result | Assistant says |
|---|---|---|
| Hi, are we still meeting for lunch at 1? I will send the location later. | — | Not a scam. "I didn't find scam signals in this message, but stay careful: never share passwords or OTPs." |
| Is this the official LHDN portal? `https://www.lhdn.gov.my/` | 🟢 LOW 0 | Not a scam. Same reply. |
| My parcel is delayed. Is this tracking link normal? `https://www.poslaju.com.my/track` | 🟢 LOW 0 | **Unsure.** "I can't be sure from this message. Verify the sender with an official number or app before you act." (`mentions 'parcel'`) |
| I got a refund notice by email, not sure if it is real. | — | **Unsure.** Same reply (`mentions 'refund'`). |
| Your Maybank account is suspended. Verify within 24 hours: `https://maybank2u-secure-login.xyz/login` | 🔴 HIGH 85 | Scam. "This has clear signs of a scam. Don't reply, don't click any links, and don't share passwords, OTPs or bank details." (`bank`, `suspended`, `verify`) |
| Can you check this Google sign-in? `https://accounts.google.com/` | 🟢 LOW 0 | Not a scam. |

The third row is the point of the act: the **address is clean and the message is still uncertain**.
A good demo answer is not always red.

Also expand **What leaves this device** on a link card, and read one `request id` out loud — the
ledger is the proof that the verdict came from somewhere.

Screenshots can be pasted, dropped or attached, but the keyword mock cannot read images and answers
"unsure — a screenshot needs the vision model". Use a screenshot only when the model key is working.

## Act 4 — honest failure (~30 s)

Stop the gateway (or switch `API_BASE` to an unused port and rebuild), then paste a link, then ask a
question. Both surfaces say **NOT CHECKED** / "The assistant did not answer. Treat this as
unverified." Close on it: "When we can't check, we say so. We never invent a green."

## Link bank

Copy-paste ready. Tiers are the final badge after the extension keeps the worse of the server and
on-device scores. None of the fabricated domains resolve.

| Link | Tier | Score | Surfaces |
|---|---|---|---|
| `https://maybank-secure-login.xyz/login` | HIGH | 95 | badge · warning · panel |
| `https://cimb-verify.top/` | HIGH | 95 | badge · warning · panel |
| `https://poslaju-fee.click/pay` | HIGH | 95 | badge · warning · panel |
| `https://tng-reload.top/login` | HIGH | 95 | badge · warning · panel |
| `https://maybank2u-secure-login.xyz/login` | HIGH | 85 | badge · warning · panel |
| `https://secure-cimb.com/login` | HIGH | 85 | badge · warning · panel |
| `https://shopee-my-reward.xyz/claim` | HIGH | 85 | badge · warning · panel |
| `https://poslaju.com.my.track-parcel.top/track` | HIGH | 85 | badge · warning · panel |
| `https://www.maybank2u.com.my.verify-account.top/login` | HIGH | 85 | badge · warning · panel |
| `https://xn--mybank-3nf.com/login` | HIGH | 80 | badge · warning · panel |
| `https://www.maybank2u.com.my@evil-site.top/login` | MEDIUM | 70 | badge · panel |
| `http://203.0.113.7/verify` | MEDIUM | 60 | badge · panel |
| `https://bit.ly/3xYzAbc` | MEDIUM | 45 | badge · panel |
| `https://tinyurl.com/2p8k9x7` | MEDIUM | 45 | badge · panel |
| `https://www.google.com/url?url=https://example.org/offer` | MEDIUM | 45 | badge · panel |
| `https://my-secure-login.top/` | LOW | 25 | badge (low but not zero — honest limit) |
| `https://www.maybank2u.com.my/home/m2u/common/login.do` | LOW | 0 | badge · panel |
| `https://www.lhdn.gov.my/` | LOW | 0 | badge · panel |
| `https://www.google.com/maps/place/KLCC` | LOW | 0 | badge |
| `https://shopee.com.my/` | LOW | 0 | badge |
| `https://docs.google.com/forms/d/e/1FAIpQLSdemo/viewform` | LOW | 0 | badge |

The shortener codes are made up. Never click a short link you cannot expand — the badge says exactly
that.

`docs.google.com` is deliberately in the bank: any Google Forms link scores LOW because only the
address is read. The form's *contents* could still be a scam — say so if someone asks. That is the
v1 boundary, not a bug.

## Local fallback

```bash
# terminal 1
cd server/enclave
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 3100

# terminal 2 — no LLM key: /agent/message answers from its mock
cd server/gateway
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
ENCLAVE_URL=http://127.0.0.1:3100 uvicorn app.main:app --port 4000
```

Then set `API_BASE = 'http://localhost:4000'` in `extension/src/config.ts` and rebuild. If the
gateway log shows `httpx.InvalidURL: Invalid port`, start both processes with `NO_PROXY=` unset:

```bash
NO_PROXY= no_proxy= ENCLAVE_URL=http://127.0.0.1:3100 uvicorn app.main:app --port 4000
```

With no `LLM_API_KEY`/`QWEN_API_KEY` in the environment the assistant uses the keyword mock, which
is what the Act 3 replies come from. Screenshots answer `unsure` in mock mode.

## If the tunnel moved

The Cloudflare quick-tunnel host is ephemeral. Refresh it from `server/README.md` ("Deployment"),
update `API_BASE` in `extension/src/config.ts`, and rebuild before the demo.
