# Lantern Assistant API contract

`POST /api/agent/chat` · JSON in, JSON out · no auth in v1 · nothing is stored.

## Request

```json
{ "message": "string, required (may be empty)", "pageUrl": "optional current tab URL", "lang": "en | ms" }
```

- `pageUrl`: the server strips the query string and fragment before scoring and never logs it. Strip it in the extension too.
- Max 2000 characters of `message` are read; at most 2 links are scored.

## Response

```json
{
  "verdict": {
    "tier": "HIGH | MEDIUM | LOW | NOT_CHECKED",
    "score": 0,
    "title": "This looks like a scam.",
    "bullets": ["max 3 short sentences"],
    "checked": ["the website address"],
    "notChecked": ["who owns the website"],
    "action": { "kind": "go_back | open | call_997 | try_again | ask_trusted", "label": "Go back to safety" },
    "quickReplies": ["Why?", "What if I already clicked?", "Check another"],
    "contact": { "label": "National Scam Response Centre (NSRC)", "phone": "997" }
  },
  "toolCalls": [{ "name": "score_url | score_message | expand_url", "ok": true, "ms": 1, "summary": "…" }],
  "model": { "used": true, "name": "qwen-plus", "calls": 1, "raisedTo": "MEDIUM" },
  "degraded": false,
  "ms": 1234
}
```

`contact` is `null` unless the tier is HIGH and the message carries money or authority pressure.

## Errors

| Status | When |
|---|---|
| 400 | body is not JSON or `message` is not a string |
| 403 | preflight from an origin that is not allowed |
| 503 | kill switch `ASSISTANT_DISABLED=1` |

Any network failure or timeout (13 s in the panel) must be shown as **NOT_CHECKED**, never green. The panel already does this.

## CORS

Allowed: `chrome-extension://<32-letter id>`, `http://localhost:*`, `http://127.0.0.1:*`, plus `ALLOWED_ORIGINS`. Anything else gets no CORS headers (preflight 403).

## Embedding the panel in the extension (5 steps)

1. Copy `assistant/public/panel/` (`index.html`, `panel.css`, `panel.js`, `panel-boot.js`) into the extension's side-panel folder. Do not edit `panel.js`.
2. In `panel-boot.js`, set `window.LANTERN_ENDPOINT` to the deployed URL, e.g. `https://<deployment>/api/agent/chat` (or define it in a small file loaded before `panel-boot.js`; MV3 forbids inline scripts).
3. `panel-boot.js` already passes the active tab URL via `chrome.tabs.query`; the extension needs the `tabs` (or `activeTab`) permission.
4. Add the deployment origin to `host_permissions` in `manifest.json`.
5. Point `side_panel.default_path` at the copied `index.html`.
