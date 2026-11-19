# Ask SHOU API

Integration contract for the browser extension side panel and any other client.
One endpoint, one static panel, no auth token in the browser.

- **Endpoint:** `POST /api/agent/chat`
- **Local:** `http://localhost:8787/api/agent/chat`
- **Hosted:** `https://<project>.vercel.app/api/agent/chat`
- **Panel:** `/` serves `panel/index.html` (the same three files the extension will ship)
- **Health:** `GET /healthz` -> `{ ok, mode: "model" | "mock", model, policyId }`

The model never sees page content, query strings or unmasked numbers, and code
owns the verdict. A model can raise the score by at most 20 points; nothing can
lower a deterministic floor, and no answer ever says "safe".

---

## 1. Request

```jsonc
POST /api/agent/chat
Content-Type: application/json

{
  "sessionId": "s_7f3a9c",              // opaque, from the panel, memory only
  "text": "What about this page?",      // what the user typed or pasted, <= 2000 chars
  "pageUrl": "https://example.com/a?token=abc",  // optional, current tab URL
  "locale": "en",                       // "en" | "ms"
  "policyId": "shou-v1",                // required; without it the server refuses
  "surface": "sidepanel",               // optional: "standalone" | "sidepanel"
  "clientVersion": "0.1.0",             // optional
  "followUp": "already_paid"            // optional, only for the "I already paid" chip
}
```

Rules:

| Field | Rule |
|---|---|
| `text` | Trimmed. At least one of `text` / `pageUrl` must carry an `http(s)` subject. |
| `pageUrl` | Only used when `text` has no URL **and** the user asks about the page (`this page`, `halaman ini`), or nothing was typed. Its query string and fragment are stripped at the edge and never reach the model. It is never fetched. |
| `policyId` | Must be `shou-v1`. Missing or different -> `400 POLICY_MISSING`. |
| `locale` | Unknown values fall back to `en`. |
| `followUp` | `already_paid` only changes the primary action for an authority-impersonation message. |

No cookies, no `Authorization` header, no page HTML, no screenshots.

---

## 2. Response

`200` is returned for every completed check, **including `NOT_CHECKED`**.
Only invalid requests use `4xx`.

```jsonc
{
  "requestId": "req_01J...",
  "policyId": "shou-v1",
  "elapsedMs": 4210,
  "verdict": {
    "tier": "HIGH",                       // HIGH | MEDIUM | LOW | NOT_CHECKED
    "score": 85,                          // 0-100, null when NOT_CHECKED
    "basis": "rules+model",               // rules+model | rules_only | not_checked
    "subject": {
      "type": "url",                      // url | message
      "source": "pageUrl",                // text | pageUrl
      "value": "maybank-secure-login.xyz/login"   // display only, no query string
    },
    "label": "This looks like a scam.",
    "summary": "Do not enter your password, OTP or bank details.",
    "reasons": [
      {
        "signalId": "brand_token_outside_domain",
        "source": "rule",                 // rule | model
        "text": "This is not Maybank's address. The real one is maybank.com.my."
      }
    ],
    "checked": ["address", "redirects"],
    "notChecked": [
      { "id": "the_page_itself", "why": "we do not open web pages" }
    ],
    "actions": [
      {
        "id": "go_back",
        "label": "Go back to safety",
        "style": "primary",
        "caption": "..."                  // optional
      }
    ],
    "quickReplies": [
      { "id": "why", "label": "Why?" },
      { "id": "clicked", "label": "What if I already clicked?" },
      { "id": "another", "label": "Check another" }
    ]
  },
  "evidence": {
    "toolCalls": [ /* see section 3 */ ],
    "modelCalls": 1,
    "toolCallsUsed": 1,
    "mode": "model"                     // model | mock
  }
}
```

### Verdict fields

- `tier`: `HIGH` >= 70, `MEDIUM` 45-69, `LOW` < 45, or `NOT_CHECKED`.
- `actions`: **exactly one** entry. `style` is always `primary`.
- `reasons`: at most 3. Every `signalId` exists in `evidence.toolCalls[].result.signals`,
  except `model_note`, `model_raise`, `model_unavailable`.
- `quickReplies`: at most 3. They are questions, not a second action.
- `basis`: `rules_only` means the model was skipped, failed or the deadline hit.
  The panel must show "Checked by rules only."

Action ids: `go_back`, `open_link`, `call_997`, `call_bank`, `ask_someone`,
`check_again`, `check_another`.
Quick-reply ids: `why`, `clicked`, `already_paid`, `another`, `what_checked`.

---

## 3. Tool results

Each entry is either a success or a failure envelope.

```jsonc
// success
{ "tool": "score_url", "ok": true, "ms": 12, "result": { ... } }

// failure
{ "tool": "expand_url", "ok": false, "code": "TIMEOUT",
  "notChecked": "where_the_link_goes", "ms": 2010 }
```

Failure codes: `TIMEOUT`, `SSRF_BLOCKED`, `UPSTREAM_5XX`, `UNPARSEABLE`,
`BUDGET_EXCEEDED`.

### `score_url`

```jsonc
{
  "score": 85, "floor": 85, "tier": "HIGH",
  "signals": [
    { "id": "brand_token_outside_domain", "weight": 85,
      "detail": { "brand": "Maybank", "official": "maybank.com.my" } }
  ],
  "domain": {
    "registrable": "maybank-secure-login.xyz",
    "tld": "xyz", "subdomains": 0,
    "ipLiteral": false, "punycode": false, "privateHost": false
  },
  "needsExpand": false,
  "display": "maybank-secure-login.xyz/login"
}
```

### `score_message`

```jsonc
{
  "score": 90, "floor": 90, "tier": "HIGH",
  "category": "impersonation_authority",
  "signals": [{ "id": "authority_impersonation", "weight": 25 }],
  "redactions": { "phone": 1, "account": 1 },
  "redactedText": "Pindahkan [number] ke akaun [number]."
}
```

`redactedText` is for debugging only. The client should render `reasons`.

### `expand_url`

```jsonc
{
  "hops": [{ "fromHost": "localhost", "toHost": "maybank-secure-login.xyz", "status": 302 }],
  "finalHost": "maybank-secure-login.xyz",
  "finalUrlScored": { /* score_url result for the destination */ },
  "blocked": false
}
```

Max 5 hops, 2 s per hop, no cookies, no referrer, no page body, private
addresses blocked. If the destination does not load, the host from the redirect
`Location` header is still scored.

### Signal ids

URL: `deny_list`, `brand_token_outside_domain`, `credential_path_with_brand`,
`punycode_or_mixed_script`, `userinfo_obfuscation`, `ip_literal_host`,
`login_on_http`, `private_host`, `shortener_no_destination`,
`open_redirect_param`, `many_subdomains`, `many_hyphens`, `suspicious_tld`,
`credential_path`, `credential_words_with_bad_tld`, `known_brand_domain`.

Message: `authority_impersonation`, `money_transfer`, `secrecy`, `urgency`,
`prize_claim`, `parcel_fee`, `investment`, `credential_request`,
`link_in_message`, `bank_mentioned`, `injection_detected`.

---

## 4. Errors

| Status | Code | When | Panel behaviour |
|---|---|---|---|
| 400 | `NO_INPUT` | no URL or text | ask the user to paste |
| 400 | `BAD_JSON` / `BAD_REQUEST` | malformed body | ask again |
| 400 | `POLICY_MISSING` | `policyId` absent/wrong | show NOT_CHECKED, do not retry blind |
| 403 | `ORIGIN_DENIED` | `Origin` not in the allowlist | show NOT_CHECKED |
| 405 | `METHOD` | not POST | - |
| 413 | `TOO_LARGE` | body > 8 KB | ask again |
| 429 | `RATE_LIMITED` | > 10/min per session or > 60/min per IP | show NOT_CHECKED |
| 500 | `INTERNAL` | unexpected failure | show NOT_CHECKED |

A network failure or a 13 s client timeout is also `NOT_CHECKED`. There is no
green fallback.

---

## 5. Fail-closed and mock mode

| Condition | Result |
|---|---|
| `score_url` / `score_message` fails, best evidence < MEDIUM | `NOT_CHECKED` |
| A check failed, but a rule floor is already >= HIGH | keep HIGH, list the missing check |
| Model fails, rules >= MEDIUM | keep tier, `basis: "rules_only"` |
| Model fails, rules < MEDIUM | `NOT_CHECKED` |
| 12 s deadline hit with evidence | keep tier, `basis: "rules_only"` |
| `QWEN_API_KEY` absent (**mock mode**) | rules verdict at any tier, `basis: "rules_only"`, `mode: "mock"` |

Mock mode is intentional: with no key, the demo still returns a verdict and the
panel still says "Checked by rules only." A configured key that then fails is
held to the fail-closed rules above.

---

## 6. CORS

Allowed `Origin` values are reflected (never `*`), with `Vary: Origin`:

- `chrome-extension://<32 chars>` - any extension id
- `http://localhost:<port>`, `http://127.0.0.1:<port>`
- `https://<anything>.vercel.app` - production and preview deployments
- Anything in the comma-separated `ALLOWED_ORIGINS` environment variable

`OPTIONS` returns `204` with `Access-Control-Allow-Methods: POST, OPTIONS`,
`Access-Control-Allow-Headers: content-type`, `Access-Control-Max-Age: 600`.
No `Access-Control-Allow-Credentials`. Unknown origins get `403`.

```bash
curl -i -X OPTIONS http://localhost:8787/api/agent/chat \
  -H 'Origin: chrome-extension://abcdefghijklmnopabcdefghijklmnop' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

---

## 7. Limits

- Body 8 KB. `text` 2000 chars, `pageUrl` 2048 chars.
- 12 s server deadline, 8 s model call, 2 model calls, 3 tool calls
  (2 mandatory code pre-checks + 1 optional `expand_url`).
- Rate limits are per process, not durable: 10/min per session, 60/min per IP.
- Nothing is persisted: no transcript, no verdict log, no URL log.

---

## 8. Panel drop-in

`panel/index.html`, `panel/panel.css`, `panel/panel.js` are framework-free and
contain **no `chrome.*` calls**. To ship it in the extension side panel:

1. Copy the three files to `extension/src/panel/`.
2. Point `manifest.json` `side_panel.default_path` at `panel/index.html`.
3. Start it with the tab URL injected:

```js
window.SHOU_CONFIG = {
  endpoint: 'https://<project>.vercel.app',
  getPageUrl: async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? null;
  },
};
```

The standalone page calls the same code with no config (same origin).
The extension origin is already in the CORS allowlist.

---

## 9. Environment

| Variable | Required | Meaning |
|---|---|---|
| `QWEN_API_KEY` | no | Enables model mode. Absent -> mock mode. Never commit. |
| `QWEN_BASE_URL` | no | Default `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | no | Default `qwen-plus` |
| `ALLOWED_ORIGINS` | no | Extra exact origins, comma-separated (the custom Vercel domain) |
| `PUBLIC_ORIGIN` | no | The deployed origin, allowed for demo redirect expansion |
| `PORT` | no | Local server port, default 8787 |
