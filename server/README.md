# Lantern server

Backend for the Lantern extension: an API gateway that forwards to an isolated scoring enclave.
This is the M1 slice — deterministic URL floors only. See "Not implemented yet" before you rely on
anything.

## Topology

| Process | Port | Reachable from | Role |
|---|---|---|---|
| `gateway` | 4000 | public (via proxy/tunnel) | transport only: validates the request, calls the enclave, returns the verdict. No text, no verdicts of its own. |
| `enclave` | 3100 | compose network only | scoring: deterministic URL rules now; redaction + models later. |

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

## API contract v0

Base URL = the current quick-tunnel hostname (see "Deployment"). Paths are exactly as in the
README spec, so the extension uses `${BASE}/risk/link` with no prefix.

### `POST /risk/link`

Score one URL.

Request:

```json
{ "url": "https://maybank-secure-login.xyz/login" }
```

`url`: string, 1–8192 chars. Only the URL is sent — redaction on the client still applies, but the
server currently forwards the raw string to the enclave (redaction is not implemented yet, see below).

Response `200`:

```json
{
  "request_id": "req_66bafc92009b",
  "tier": "HIGH",
  "score": 80,
  "checks": [{ "rule": "punycode_host", "floor": 80 }],
  "error": null
}
```

| Field | Type | Notes |
|---|---|---|
| `request_id` | string | per-request id, format `req_<12 hex>`; log it in the UI's "what I checked" line |
| `tier` | `LOW` \| `MEDIUM` \| `HIGH` \| `NOT_CHECKED` | the badge state |
| `score` | int 0–100 \| `null` | current deterministic floor (models not fused yet); `null` when `NOT_CHECKED` |
| `checks` | `{rule: string, floor: int}[]` | rule hits behind the score; empty is valid |
| `error` | string \| `null` | `"enclave_unavailable"` when the enclave could not be reached |

Fail-closed rule: if the enclave is down or returns garbage, the gateway answers **`200` with
`tier: "NOT_CHECKED"` and `error: "enclave_unavailable"`**. It never invents `LOW`. The UI must
render that as ⚠︎ "Could not check this link", not green.

Errors: `422` for a missing/empty/oversized `url` (FastAPI validation body, standard shape).

Tier thresholds (current): `score >= 80` → HIGH, `45–79` → MEDIUM, `< 45` → LOW.

Implemented deterministic rules (floor = minimum score):

| Rule | Floor | Trigger |
|---|---|---|
| `userinfo_obfuscation` | 70 | `https://maybank.com.my@evil.xyz/...` |
| `ip_literal` | 60 | host is an IP address |
| `punycode_host` | 80 | host starts with `xn--` or a unicode host that IDNA-encodes to `xn--` |

The worst floor wins; scores only ever go up from these floors.

### `GET /health`

`{"status": "ok"}` — gateway liveness only.

### `GET /api/ping`

Returns `ping` as text. Temporary connectivity check while the extension is unwired; will be removed
once `/risk/link` is in real use. Do not build product behaviour on it.

### Not implemented yet — do not assume

- **Redaction.** The extension is supposed to strip identifying values before sending; the gateway
  currently forwards the raw URL to the enclave, and the enclave does **not** redact again yet.
- **Models / verifier.** No classifier, no cross-verification, no MEDIUM "held for review" logic.
- **`POST /agent`.** The assistant/agent endpoint does not exist. Any `/agent*` path currently 404s
  at the gateway (routed there, but no handler). Contract will be agreed before M2.
- **Deny-list, brand-token, shortener, domain-age rules.** Only the three rules above exist.
- **CORS / origin allow-list.** No CORS headers are configured. A Manifest V3 service worker calling
  this host with `host_permissions: ["https://<tunnel-host>/*"]` does not need CORS; if the
  extension point is not granted host permissions, coordinate the allow-list with Fahreza instead of
  disabling web security.
- **Rate limiting, kill switch, persistence.** None.

Contract changes are decisions: append to `team/decisions.md` and notify Fihkri (task T-039).

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

## Deployment (team server 172.104.41.120)

Compose project `app` lives in `/srv`; the repo is cloned at `/srv/repo`.

```bash
# from the server
cd /srv
./deploy.sh            # docker compose up -d --build, then prints the tunnel URL
```

- Services: `gateway`, `enclave`, `proxy` (nginx), `tunnel` (cloudflared quick tunnel), `web`
  (placeholder Next.js page).
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
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"url":"https://maybank.com.my@evil.xyz/login"}' "$BASE/risk/link"
# -> MEDIUM, floor 70, userinfo_obfuscation

curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"url":"https://maybank.com.my/login"}' "$BASE/risk/link"
# -> LOW, score 0, checks []

curl -s -o /dev/null -w '%{http_code}\n' "$BASE/score"
# -> 404: the enclave is not publicly routed
```

## Layout

```
server/
├── gateway/
│   ├── app/
│   │   ├── main.py       routes: /health, /api/ping, /risk/link
│   │   ├── client.py     enclave client (HTTP, 8s timeout, fail-closed)
│   │   ├── models.py     risk request + verdict models
│   │   └── config.py     ENCLAVE_URL, ENCLAVE_TIMEOUT env vars
│   ├── Dockerfile
│   └── requirements.txt
└── enclave/
    ├── app/
    │   ├── main.py       routes: /health, /score
    │   ├── rules.py      deterministic floors (pure functions)
    │   ├── scoring.py    tier thresholds + verdict assembly
    │   └── models.py
    ├── tests/            pytest: rules + tier boundaries
    ├── Dockerfile
    └── requirements.txt
```
