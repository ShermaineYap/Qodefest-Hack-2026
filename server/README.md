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
                                 └── everything else ──────────────────────► web:3000 (placeholder page)
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

| Rule | Floor | Trigger (payload flag) |
|---|---|---|
| `lookalike_characters` | 80 | `punycode`, `mixedScript` or `homoglyph` |
| `userinfo_obfuscation` | 70 | `userinfo` |
| `ip_literal` | 60 | `ipLiteral` |
| `shortener` | 45 | `shortener` |
| `suspicious_tld` | 25 | `suspiciousTld` |

### `GET /health`

`{"status": "ok"}` — gateway liveness only.

### `POST /agent/message`

**Dummy endpoint, no agent yet.** Stores one message from the extension (or curl) in SQLite
(`/srv/data/messages.db` on the team server) and returns its log id. It does not call a model and
does not answer; the real agent endpoint will replace this behaviour.

Request (all fields optional; unknown fields are kept in the stored payload):

```json
{
  "v": 1,
  "client": "extension",
  "kind": "chat",
  "text": "why does this site ask for my IC number?",
  "url": "https://example.com/login",
  "ts": "2026-11-19T06:00:00Z"
}
```

Limits: `text` ≤ 8000 chars, `url` ≤ 2048 chars. Response `201`:

```json
{ "id": 1, "received_at": "2026-11-19T05:44:53+00:00" }
```

### `GET /agent/messages`

Read back what was stored, newest first. `?limit=` 1–100 (default 20). Each row includes the full
stored payload:

```json
[
  {
    "id": 1,
    "received_at": "2026-11-19T05:44:53+00:00",
    "client": "extension",
    "kind": "chat",
    "text": "why does this site ask for my IC number?",
    "url": "https://example.com/login",
    "payload": { "v": 1, "client": "extension", "kind": "chat", "text": "…", "url": "…", "ts": "…" }
  }
]
```

Storage is a single SQLite table (`messages`: `id`, `received_at`, `client`, `kind`, `text`, `url`,
`payload` as JSON). The file lives on the host at `/srv/data/` (bind-mounted to `/data` in the
gateway container), so it survives rebuilds. This is deliberately temporary; see D-009.


### `GET /api/ping`

Returns `ping` as text. Temporary connectivity check while the extension is unwired; will be removed
once `/risk/link` is in real use. Do not build product behaviour on it.

### Not implemented yet — do not assume

- **Server-side re-redaction.** The payload is already redacted by the extension; the enclave does
  not currently strip anything else from `host`/`pathShape`.
- **Models / verifier.** No classifier, no cross-verification, no MEDIUM "held for review" logic.
- **A real agent endpoint.** `POST /agent/message` only stores messages in SQLite and returns the log
  id — it does not answer. Any other `/agent*` path 404s at the gateway. The separate Ask SHOU agent
  API is described in `docs/ask-shou-api.md` and served by `server/index.ts` (local :8787, Vercel in
  production) — it is not part of this compose stack yet. Contract will be agreed before M2.
- **Database beyond message logging.** One SQLite table, no migrations; no auth on `GET /agent/messages`.
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
  (placeholder Next.js page).
- Dummy agent messages persist in `/srv/data/messages.db` (bind-mounted to `/data` in the gateway),
  so they survive rebuilds. Back it up or delete it freely; there is no migration tooling.
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

# Dummy agent log: store one message, then read it back
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"v":1,"client":"curl","kind":"chat","text":"hello"}' "$BASE/agent/message"
# -> {"id":1,"received_at":"..."}
curl -s "$BASE/agent/messages?limit=5"
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
