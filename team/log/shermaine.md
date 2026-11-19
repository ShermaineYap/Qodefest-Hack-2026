# Session log — Shermaine

Newest first. Only Shermaine's agent writes here.

## 2026-11-19 13:30
- Did: Built Ask SHOU v1 on branch `ask-shou` (PR #1): `server/` contract, deterministic URL/message floors, bounded agent loop, Qwen client, EN/BM copy; standalone `panel/`; Vercel handler; `docs/ask-shou-api.md`; 21 unit tests. Ran the five acceptance tests locally in mock mode; all pass.
- Next: review the BM strings, merge PR #1, then deploy on Vercel with `QWEN_API_KEY` set as a project env var (never committed).
- Blocked on / needs from others: nothing for v1. Extension wiring is Fihkri's (plain `window.SHOU.start({...})` drop-in); live-model mode needs a Qwen key from whoever owns the Vercel project.

