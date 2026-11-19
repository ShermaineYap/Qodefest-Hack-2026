# Session log — Shermaine

Newest first. Only Shermaine's agent writes here.

## 2026-11-19 14:25 +08
- Did: Rebuilt the extension side panel as a chat (D-014): conversation log, EN/BM toggle, verdict cards with "Why", one primary action, quick replies; link-free messages and "Ask Lantern Assistant to explain" now call the gateway's `/agent/message`; link checks keep `/risk/link` and now pass `localScore`. Removed the Vercel/`ASSISTANT_BASE` path. Tested the real built extension in Chrome against the gateway + enclave running locally: link → HIGH with brand evidence, message → scam card, all three messages stored in SQLite. Extension 29 tests pass; type-check and build clean.
- Next: Fahreza sets `LLM_API_KEY` and redeploys so replies come from Qwen and BM messages are understood (mock is English keywords only); Fihkri reloads the extension.
- Blocked on / needs from others: Fahreza: redeploy (T-042) with the model key. Fihkri: reload and smoke-test (T-043).

## 2026-11-19 14:10 +08
- Did: Connected the extension to the Lantern Assistant (D-012): `ask` message in the service worker, side panel sends link-free messages to `/api/agent/chat` and offers "Ask Lantern Assistant to explain" after each link result, `ASSISTANT_BASE` in config, Vercel host permission, manifest renamed to Lantern. Added server-side `deny_list`, `brand_impersonation`, `credential_harvest`, `insecure_login`, `open_redirect` floors to the enclave with evidence sentences (15 pytest pass); extension 29 tests pass; build OK.
- Next: Deploy the assistant on Vercel as `lantern-assistant` (T-041) so `ASSISTANT_BASE` resolves; Fahreza to redeploy the enclave.
- Blocked on / needs from others: Fahreza: run `./deploy.sh` to ship the new rules (T-042). Fihkri: reload the extension and smoke-test the panel message flow (T-043).

## 2026-11-19 13:30
- Did: Built Ask SHOU v1 on branch `ask-shou` (PR #1): `server/` contract, deterministic URL/message floors, bounded agent loop, Qwen client, EN/BM copy; standalone `panel/`; Vercel handler; `docs/ask-shou-api.md`; 21 unit tests. Ran the five acceptance tests locally in mock mode; all pass.
- Next: review the BM strings, merge PR #1, then deploy on Vercel with `QWEN_API_KEY` set as a project env var (never committed).
- Blocked on / needs from others: nothing for v1. Extension wiring is Fihkri's (plain `window.SHOU.start({...})` drop-in); live-model mode needs a Qwen key from whoever owns the Vercel project.

