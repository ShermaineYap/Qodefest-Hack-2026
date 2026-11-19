# Lantern server

Backend for the Lantern extension: an API gateway that forwards to an isolated scoring enclave.
This is the M1 slice — deterministic URL floors only. See "Not implemented yet" before you rely on
anything.

## Topology

| Process | Port | Reachable from | Role |
|---|---|---|---|
| `gateway` | 4000 | public (via proxy/tunnel) | validates requests, calls the enclave, returns the verdict; also stores dummy `/agent/message` logs in SQLite. No verdicts of its own. |
| `enclave` | 3100 | compose network only | scoring: deterministic flag-based rules now; models later. |

```
extension / curl
      │  HTTPS
      ▼
Cloudflare quick tunnel  ──►  nginx (compose `proxy`, :80)
                                 ├── /risk/*, /agent*, /health, /api/ping ──► gateway:4000
                                 └── everything else ──────────────────────► web:3000 (dashboard)
                                                                              │
                                                              gateway ──► enclave:3100  (internal only)
```

The enclave is **not routed** through nginx. Hitting `/score` on the public host returns 404 on purpose.

## API contract v0.1

Base URL = the current quick-tunnel hostname (see "Deployment"). Paths are exactly as in the
README spec, so the extension uses `${BASE}/risk/link` with no prefix.

This contract is aligned with `extension/src/types.ts` (`RedactedPayload`) and the verdict fields
`extension/src/background.ts` parses. Change them together.

### `POST /risk/link`

Score one link from the redacted facts the extension already computes. The raw URL never crosses
the network.

Request:

```json
{
  "v": 1,
  "scheme": "https",
  "host": "maybank-secure-login.xyz",
  "registrable": "maybank-secure-login.xyz",
  "tld": "xyz",
  "subdomainCount": 0,
  "pathShape": "/login",
  "flags": {
    "ipLiteral": false,
    "punycode": false,
    "mixedScript": false,
    "homoglyph": false,
    "userinfo": false,
    "shortener": false,
    "suspiciousTld": true,
    "hyphenHeavy": true,
    "openRedirect": false
  },
  "localSignals": ["suspicious_tld"],
  "redactions": { "queryParams": 2, "emails": 0, "phones": 0, "ids": 0, "cards": 0, "wallets": 0 }
}
```

Only `v` is required (`flags`, `localSignals` and `redactions` default to empty). `localSignals`
are advisory: the enclave re-derives its own signals from `flags`, so a stale or spoofed client
cannot lower a verdict.

Response `200`:

```json
{
  "request_id": "req_66bafc92009b",
  "tier": "medium",
  "score": 60,
  "headline": "This link looks off. Open it only if you were expecting it.",
  "sentences": [
    "Some details of this address look unusual.",
    "Open it only if you were expecting it."
  ],
  "checked": ["domain", "path type", "lookalike characters", "local rules"],
  "category": null,
  "held_for_review": false,
  "checks": [{ "rule": "userinfo_obfuscation", "floor": 70 }]
}
```

| Field | Type | Notes |
|---|---|---|
| `request_id` | string | `req_<12 hex>`; show in the "what I checked" line |
| `tier` | `low` \| `medium` \| `high` | **lowercase**, exactly as `background.ts` validates |
| `score` | int 0–100 | current deterministic floor (models not fused yet) |
| `headline` | string | primary copy for the badge/panel |
| `sentences` | string[] | non-empty; the extension renders these as evidence |
| `checked` | string[] | what was examined, for the evidence ledger |
| `category` | string \| null | reserved; always `null` today |
| `held_for_review` | bool | `false` until models land |
| `checks` | `{rule, floor}[]` | rule hits behind the score; the extension ignores this field |

Fail-closed: if the enclave is unreachable or returns garbage, the gateway answers **`503`**
(`{"detail": "enclave_unavailable"}`). The extension treats any non-2xx / unparseable response as
**NOT CHECKED** — never green. Malformed payloads get a `422` (FastAPI validation shape).

Tier thresholds (current): `score >= 80` → high, `45–79` → medium, `< 45` → low.

Implemented deterministic rules (floor = minimum score; worst floor wins):

| Rule | Floor | Trigger |
|---|---|---|
| `deny_list` | 95 | `registrable` or `host` on the deny list (mirrors `extension/src/link.ts`) |
| `brand_impersonation` | 85 | a brand token (Maybank, CIMB, Shopee, LHDN…) in `host` but `registrable` is not that brand's domain |
| `credential_harvest` | 80 | brand impersonation + `pathShape` is `/login`, `/verify` or `/account` |
| `lookalike_characters` | 80 | `punycode`, `mixedScript` or `homoglyph` |
| `userinfo_obfuscation` | 70 | `userinfo` |
| `ip_literal` | 60 | `ipLiteral` |
| `insecure_login` | 60 | `scheme` is `http` + a sign-in `pathShape` |
| `shortener` | 45 | `shortener` |
| `open_redirect` | 45 | `openRedirect` |
| `suspicious_tld` | 25 | `suspiciousTld` |

`sentences` now name the rules that fired (for example "The address mentions Maybank, but Maybank's real address is maybank.com.my."), followed by one action sentence.

The extension also applies its own on-device floors to the server verdict (worst verdict wins), so a stale server can never show a known-bad link as green.

### `GET /health`

`{"status": "ok"}` — gateway liveness only.

### `POST /agent/message`

Accepts one message from the extension (text and/or a screenshot), asks the configured model
whether it looks like a scam, then cross-checks the message against the stored message log. A scam
is labelled `new_scam` the first time it appears and `known_scam` when the same message was already
stored with a `scam` verdict. The verdict, novelty label and reply come back in the same call.

Request (all fields optional; unknown fields are kept in the stored payload):

```json
{
  "v": 1,
  "client": "extension",
  "kind": "chat",
  "text": "why does this site ask for my IC number?",
  "url": "https://example.com/login",
  "ts": "2026-11-19T06:00:00Z",
  "image": "data:image/png;base64,…"
}
```

Limits: `text` ≤ 8000 chars, `url` ≤ 2048 chars, `image` ≤ ~4.5 MB as a `png`, `jpeg` or `webp`
data URL. Remote image URLs are rejected. The image is sent to the model but never stored — the log
keeps only its mime type and size.

Response `201`:

```json
{
  "id": 2,
  "received_at": "2026-11-19T06:10:02+00:00",
  "status": "scam",
  "reply": "This has clear signs of a scam. Don't reply, don't click any links, and don't share passwords, OTPs or bank details.",
  "reasons": ["mentions 'otp'", "asks for a payment", "mentions 'click'"],
  "model": "qwen-plus",
  "scam_status": "known_scam",
  "scam_note": "This is a known scam: we first recorded it on 2026-11-19T05:44:53+00:00.",
  "first_seen_id": 1,
  "first_seen_at": "2026-11-19T05:44:53+00:00"
}
```

| `status` | Meaning | Client copy |
|---|---|---|
| `scam` | Clear scam signals | Treat as dangerous; one primary action (go back / don't reply) |
| `not_scam` | No scam signals found — never "guaranteed safe" | Stay careful anyway |
| `unsure` | Not enough evidence, or the answer was unusable | Verify the sender elsewhere |

| `scam_status` | Meaning |
|---|---|
| `new_scam` | The verdict is `scam` and no stored scam has the same fingerprint |
| `known_scam` | A message with the same fingerprint was already stored with a `scam` verdict; `first_seen_id` / `first_seen_at` point at the first report and `scam_note` names its date |
| `null` | The verdict is `not_scam` or `unsure` — `scam_note` is empty |

The fingerprint is the SHA-256 of the message text, lower-cased with runs of whitespace collapsed;
for a message with no text it is the same normalization of `url`. Matching is exact after
normalization (no fuzzy or partial matching yet), and rows stored before fingerprinting existed are
backfilled at startup. A repeat of a stored scam is returned as `status: "scam"` even if the model
is unsure or says `not_scam` that day, so known repeat scams cannot regress to green.

Fail-closed: if the model is unreachable, times out (`AGENT_TIMEOUT`, default 20 s) or returns
unusable output, the gateway answers **`503`** (`{"detail": "agent_unavailable"}`) and stores
nothing. On any other non-2xx the client must show **NOT CHECKED**, never a guessed verdict.

**Mock mode.** With no `LLM_API_KEY` set, the endpoint runs a deterministic keyword mock
(`"model": "mock"`) so clients can integrate. Replace it by setting `LLM_API_KEY` (and optionally
`LLM_BASE_URL`, `LLM_MODEL`, `LLM_VISION_MODEL`) in `/srv/.env` and redeploying. Defaults target
Qwen's OpenAI-compatible endpoint (`qwen-plus`; screenshots: `qwen-vl-plus`), so any
OpenAI-compatible provider works by changing `LLM_BASE_URL` and the model names. Keys never go in
the repo.

### `GET /agent/messages`

Read back what was stored, newest first. `?limit=` 1–100 (default 20). Each row includes the full
stored payload (with the image reduced to `{mime, chars}`) and its analysis:

```json
[
  {
    "id": 1,
    "received_at": "2026-11-19T05:44:53+00:00",
    "client": "extension",
    "kind": "chat",
    "text": "why does this site ask for my IC number?",
    "url": "https://example.com/login",
    "status": "scam",
    "reply": "This has clear signs of a scam. …",
    "reasons": ["mentions 'otp'"],
    "model": "qwen-plus",
    "scam_status": "known_scam",
    "scam_note": "This is a known scam: we first recorded it on 2026-11-19T05:44:53+00:00.",
    "first_seen_id": 1,
    "first_seen_at": "2026-11-19T05:44:53+00:00",
    "payload": { "v": 1, "client": "extension", "kind": "chat", "text": "…", "url": "…", "ts": "…" }
  }
]
```

Storage is a single SQLite table (`messages`: `id`, `received_at`, `client`, `kind`, `text`, `url`,
`payload`, `status`, `reply`, `reasons`, `model`, `fingerprint`, `scam_status`, `scam_note`,
`first_seen_id`, `first_seen_at`). The file lives on the host at `/srv/data/`
(bind-mounted to `/data` in the gateway container), so it survives rebuilds. Columns added after the
first deploy are migrated in place at startup; see D-009 and D-013.


### `GET /api/ping`

Returns `ping` as text. Temporary connectivity check while the extension is unwired; will be removed
once `/risk/link` is in real use. Do not build product behaviour on it.

### Dashboard (`/`)

The tunnel root serves a read-only Next.js dashboard (`dashboard/` in the repo) that polls
`GET /agent/messages?limit=50` every 5 s from the browser (same origin, so no CORS). No auth. It
filters by kind and free-text on the client and shows raw payloads in a line-numbered panel. When
the gateway is unreachable it says so and shows the last rows it received — it never fabricates data.
Styling uses Tailwind v4 and vendored [Beautiful UI](https://www.beautifului.dev) primitives (MIT;
see `dashboard/THIRD_PARTY_NOTICES.md`).

### Not implemented yet — do not assume

- **Server-side re-redaction.** The payload is already redacted by the extension; the enclave does
  not currently strip anything else from `host`/`pathShape`. `/agent/message` stores whatever text
  the client sends — redact before it leaves the browser.
- **Models / verifier on links.** `/risk/link` is still deterministic rules only.
- **Agent conversation.** `/agent/message` is one model call per message: no streaming, no multi-turn
  history, no tools, no follow-up chips. The separate Ask SHOU agent API (`docs/ask-shou-api.md`,
  `server/index.ts`, :8787/Vercel) is still not part of this compose stack.
- **Fuzzy scam matching.** New-vs-known compares the exact normalized text (or URL when text is
  empty). A reworded or partly edited repeat counts as a new scam; there is no fuzzy hash, shared
  threat feed or cross-host cache yet. A screenshot-only message with no text or URL cannot be
  deduplicated.
- **Auth / rate limits on the message endpoint.** None yet; anyone with the tunnel URL can spend
  model tokens. Add a shared secret and rate limit before publicising the host.
- **Deny-list, brand-token, domain-age, redirect rules.** Only the five flag-based rules above exist.
- **CORS / origin allow-list.** No CORS headers are configured. A Manifest V3 service worker calling
  this host with `host_permissions: ["https://<tunnel-host>/*"]` does not need CORS; if the
  extension point is not granted host permissions, coordinate the allow-list with Fahreza instead of
  disabling web security.
- **Rate limiting, kill switch, persistence.** None.

Contract changes are decisions: append to `team/decisions.md` and notify Fihkri (task T-040).

## Local development

```bash
cd server/enclave
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 3100   # terminal 1

cd server/gateway
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
ENCLAVE_URL=http://127.0.0.1:3100 uvicorn app.main:app --reload --port 4000   # terminal 2
```

Tests (enclave, pure functions — no server needed):

```bash
cd server/enclave
pip install -r requirements-dev.txt
python -m pytest
```

Gateway tests (message logging, in-memory FastAPI client):

```bash
cd server/gateway
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest
```

## Deployment (team server 172.104.41.120)

Compose project `app` lives in `/srv`; the repo is cloned at `/srv/repo`.

```bash
# from the server
cd /srv
./deploy.sh            # docker compose up -d --build, then prints the tunnel URL
```

- Services: `gateway`, `enclave`, `proxy` (nginx), `tunnel` (cloudflared quick tunnel), `web`
  (Next.js message-log dashboard).
- Messages and their verdicts persist in `/srv/data/messages.db` (bind-mounted to `/data` in the
  gateway), so they survive rebuilds. Back it up or delete it freely; columns are added in place.
- Model settings live in `/srv/.env` (read by Docker Compose, never committed):
  `LLM_API_KEY=…` plus optional `LLM_BASE_URL`, `LLM_MODEL`, `LLM_VISION_MODEL`, `AGENT_TIMEOUT`.
  Without a key the message endpoint answers with `"model": "mock"`.
- No inbound HTTP ports are open; only SSH is allowed by ufw. All public traffic arrives through the
  outbound quick tunnel.
- The quick-tunnel hostname is **ephemeral** and changes whenever `app-tunnel-1` restarts. Get it:

  ```bash
  show_tunnel_url() { docker logs app-tunnel-1 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1; }
  show_tunnel_url
  ```

  Current URL as of 2026-11-19:
  `https://sophisticated-blues-undertaken-mechanics.trycloudflare.com`

- Update flow after pulling new code: `cd /srv && ./deploy.sh`.
- Logs: `docker compose logs -f gateway enclave`.

## Smoke tests

```bash
BASE=https://<current-tunnel-host>

curl -s "$BASE/health"
curl -s "$BASE/api/ping"

# HIGH: lookalike characters
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"host":"xn--80ak6aa92e.com","flags":{"punycode":true}}' "$BASE/risk/link"
# -> tier "high", score 80

# MEDIUM: userinfo obfuscation
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"host":"evil.xyz","flags":{"userinfo":true}}' "$BASE/risk/link"
# -> tier "medium", score 70

# LOW: nothing flagged
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"host":"maybank.com.my"}' "$BASE/risk/link"
# -> tier "low", score 0

curl -s -o /dev/null -w '%{http_code}\n' "$BASE/score"
# -> 404: the enclave is not publicly routed

# Message check: store one message, get status scam | not_scam | unsure
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"client":"curl","kind":"chat","text":"Your account is blocked. Send the OTP now."}' \
  "$BASE/agent/message"
# -> {"id":1,"status":"scam","reply":"…","reasons":[…],"model":"mock|qwen-plus",…}
curl -s "$BASE/agent/messages?limit=5"

# Screenshot input (tiny 1x1 png; accepted, answered by the vision model when configured)
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"text":"is this legit?","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}' \
  "$BASE/agent/message"
```

## Layout

```
server/
├── gateway/
│   ├── app/
│   │   ├── main.py       routes: /health, /api/ping, /risk/link, /agent/message, /agent/messages
│   │   ├── client.py     enclave client (HTTP, 8s timeout, fail-closed)
│   │   ├── db.py         SQLite message log (init, insert, list)
│   │   ├── models.py     redacted payload + verdict + agent message models
│   │   └── config.py     ENCLAVE_URL, ENCLAVE_TIMEOUT, DB_PATH env vars
│   ├── tests/            pytest: message logging
│   ├── Dockerfile
│   ├── requirements.txt
│   └── requirements-dev.txt
└── enclave/
    ├── app/
    │   ├── main.py       routes: /health, /score
    │   ├── rules.py      deterministic floors from payload flags (pure functions)
    │   ├── scoring.py    tier thresholds + verdict assembly
    │   └── models.py
    ├── tests/            pytest: rules + tier boundaries
    ├── Dockerfile
    └── requirements.txt
```
