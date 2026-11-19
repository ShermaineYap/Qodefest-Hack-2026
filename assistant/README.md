# Lantern Assistant — the agentic chat box

Owner: Shermaine Yap. Standalone app in `assistant/` (does not touch `extension/` or the backend).

Paste a link or a message; a bounded agent checks it with tools and answers with a verdict, what it checked, what it could not check, and one next step. It runs on its own as a web page (the live demo) and drops into the extension's side panel later.

## How it works

1. **Mandatory deterministic checks (code decides these run):** `score_url` on up to two links (plus the current page URL, query string stripped) and `score_message` on the text.
2. **Bounded model turn:** Qwen (`qwen-plus`, Alibaba Cloud Model Studio, OpenAI-compatible tool calling) sees the tool results and the message as `UNTRUSTED_DATA`. It may call `expand_url` once for a short link, then writes up to three plain bullets in English or BM.
3. **Code owns the verdict:** worst result wins; rule floors hold; the model can raise risk, never lower it, and on its own can reach MEDIUM only. HIGH needs a rule floor of 70+. No answer ever says "safe".
4. **Fail closed:** any failure is `NOT_CHECKED` with "Try again", never green. Without a Qwen key it runs rules-only.

Budget per turn: ≤ 3 tool calls, ≤ 2 model calls, ~8 s. `expand_url`: HEAD only, ≤ 5 redirects, 3 s, no cookies or referrer, private/loopback addresses refused (SSRF guard).

| Rule (URL) | Floor |
|---|---|
| Brand name outside the brand's real domain (e.g. `maybank-secure-login.xyz`) | 85 |
| Look-alike letters (punycode / non-ASCII host) | 80 |
| `user@host` trick | 70 |
| Bare IP address, or login page over plain http | 60 |
| Short link (bit.ly etc.) not yet expanded | 45 |

| Rule (message) | Floor |
|---|---|
| Asks for OTP / TAC / password | 85 |
| Authority + urgency + secrecy (Macau scam) | 80 |
| "Safe account" transfer | 70 |

## Run

```bash
cd assistant
cp .env.example .env.local   # QWEN_API_KEY optional: without it the rules still answer
npm install
npm run dev                  # http://localhost:3000  (demo page)  ·  /panel/index.html (panel only)
npm test                     # 12 unit tests: floors, official domains, "model cannot lower the verdict"
```

## Deploy (Vercel)

Import the repo, set **Root Directory** to `assistant`, add `QWEN_API_KEY`. Optional: `ALLOWED_ORIGINS`, `ASSISTANT_DISABLED=1` (kill switch).

## Embedding in the extension

See [`docs/assistant-api.md`](../docs/assistant-api.md).
