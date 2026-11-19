# Link Guard extension

Chrome MV3 scaffold for the Link Guard hack project. The product spec is the repository root
`README.md`; this file covers building, running and the API contract.

## Requirements

- Node 22.6+ (tests run TypeScript directly via `--experimental-strip-types`)
- Chrome 116+

## Build and load

```bash
npm install
npm run build
# chrome://extensions -> Developer mode -> Load unpacked -> extension/dist
```

While iterating, run `npm run watch` and press Reload on the extension card after each rebuild.

## Checks

```bash
npm run typecheck
npm test
```

## Demo without the backend

```bash
npm run mock-api
```

Starts a canned scoring service on `http://localhost:4000` (POST `/risk/link`, GET `/health`).
Switch `API_BASE` in `src/config.ts` to `http://localhost:4000` to use it. It is a development aid
only; the real API belongs to the backend owner (T-034).

## Layout

- `src/link.ts` - URL normaliser plus deterministic rules (pure, unit-tested)
- `src/redact.ts` - builds the redacted payload; nothing else leaves the device
- `src/content.ts` - scans chat pages and draws the inline badges
- `src/background.ts` - the only network surface: scoring client, cache, navigation hook
- `src/warning/` - interstitial for HIGH top-level navigations
- `src/panel/` - assistant side panel
- `src/selectors.ts` - per-site DOM selectors (one table, pinned by tests)

## API contract v0.1 (`server/README.md`)

`POST {API_BASE}/risk/link`. Types live in `src/types.ts` and `src/messages.ts`. `API_BASE` is in
`src/config.ts`: the public demo gateway (an ephemeral Cloudflare quick tunnel — refresh the
hostname from `server/README.md` "Deployment" when it restarts) or `http://localhost:4000` for local
development. `host_permissions` covers `https://*.trycloudflare.com/*` and localhost.

Request body (`RedactedPayload` v1):

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
    "hyphenHeavy": false,
    "openRedirect": false
  },
  "localSignals": ["deny_list", "brand_impersonation", "credential_harvest", "suspicious_tld"],
  "redactions": { "queryParams": 0, "emails": 0, "phones": 0, "ids": 0, "cards": 0, "wallets": 0 }
}
```

Response:

```json
{
  "request_id": "req_...",
  "tier": "low | medium | high",
  "score": 0,
  "headline": "Looks like a scam link",
  "sentences": ["It asks for your Maybank login, but it is not maybank.com.my."],
  "checked": ["domain", "redirects", "domain age"],
  "category": "brand_impersonation",
  "held_for_review": false
}
```

Client behavior: 8 s timeout; any failure or unreadable answer becomes NOT CHECKED. The client never
invents a LOW. The worker is the only place that calls this endpoint.

The server re-derives its score from the redacted flags only, so the extension keeps the worse of
the server tier and its own on-device score (`src/verdict.ts`): a deny-listed or brand-impersonating
host can be raised but never lowered, and never renders green.

## Scaffold limits

- Top-level navigations are scored after they start; a HIGH verdict redirects the tab to the
  interstitial. Hard-gating navigation is M1/M3 work.
- `score_message` and streaming are not implemented (M2).
- The deny list and brand list in `src/link.ts` are seeds for the local rules; the server owns the
  real lists.
- Nothing is persisted: verdicts live in service-worker memory only.
