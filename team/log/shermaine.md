# Session log — Shermaine

Newest first. Only Shermaine's agent writes here.

## 2026-11-19 13:45 +08
- Did: Built the Lantern Assistant in `assistant/` on branch `chatbot` (T-039): Next.js app with `POST /api/agent/chat` (bounded agent: mandatory `score_url`/`score_message`, Qwen tool call for `expand_url`, code-owned verdict with floors, model can only raise and never says safe, fail-closed NOT_CHECKED, SSRF-guarded expander, CORS allowlist, kill switch), a plain-JS chat panel (EN/BM, quick replies, one action), a demo page, `docs/assistant-api.md`, 12 unit tests passing.
- Next: Deploy on Vercel with the Qwen key (T-041); merge `chatbot` into main after review.
- Blocked on / needs from others: Fihkri to embed the panel or call the endpoint (T-040). Overlap to settle: D-002 lists "agent endpoints" under Fahreza; this app owns the chat-box agent only, `/risk/link` stays with Fahreza.
