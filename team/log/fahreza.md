# Session log — Fahreza

Newest first. Only Fahreza's agent writes here.

## 2026-11-19 05:49
- Did: Replaced the placeholder page with a read-only dashboard at `/` (D-011): Next.js app in `dashboard/`, newest-first message table with expandable payloads, 5 s auto-refresh, explicit gateway-down state with no fabricated data. No new API — it polls `GET /agent/messages`. Updated compose to build `./repo/dashboard`, root README and `server/README.md`. Verified through the tunnel: root 200 with expected markup, JS chunks 200, messages endpoint 200. No browser on the host, so verification was HTTP-level only.
- Next: T-034 — remaining rules, model fusion/verifier, real agent endpoint (replaces the SQLite stub).
- Blocked on / needs from others: nothing.

## 2026-11-19 05:48
- Did: Added the dummy agent log endpoints (D-009): `POST /agent/message` validates a loose message from the extension and stores it in SQLite, `GET /agent/messages` reads the last N back. Gateway now owns a `messages` table at `/srv/data/messages.db` (bind-mounted to `/data`), with 6 gateway pytest cases and docs in `server/README.md`. Verified through the public tunnel: stored id 1, read it back, file visible on the host. Also refreshed the root README status table.
- Next: T-034 — remaining rules, model fusion/verifier, real agent endpoint (replaces the SQLite stub).
- Blocked on / needs from others: nothing.

## 2026-11-19 05:38
- Did: Aligned the live API with the extension's real client (D-008): `POST /risk/link` now takes `RedactedPayload` and returns the verdict shape `extension/src/background.ts` parses (`tier` lowercase, `headline`, `sentences`, `checked`, `held_for_review`), with fail-closed `503` when the enclave is unreachable. Rewrote the enclave as flag-based floors (lookalike 80, userinfo 70, ip-literal 60, shortener 45, suspicious TLD 25; worst wins), 11 pytest cases passing. Updated `server/README.md` to contract v0.1 with request/response examples, smoke tests, and a "not implemented yet" list (models, `/agent`, re-redaction, CORS, rate limits). Redeployed and verified through the public tunnel: high/medium/low verdicts, 422 on bad payload, 503 with the enclave stopped, `/score` still 404 publicly.
- Next: T-034 — remaining rules (deny-list, brand token, redirects), model fusion + verifier, then the `/agent` endpoint; freeze the contract with Fihkri before M1.
- Blocked on / needs from others: nothing.

## 2026-11-19 05:31
- Did: Deployed backend to the team server: `server/gateway` (:4000, transport-only) + `server/enclave` (:3100, internal-only) as FastAPI packages with tests, Dockerfiles, and a Docker Compose stack behind an internal nginx and a Cloudflare quick tunnel. Published API contract v0 in `server/README.md` (endpoints, response shape, NOT_CHECKED semantics, implemented rules, what is not implemented). Fixed email in `roles.md`, recorded D-007, added T-040 for the extension.
- Next: T-034 — fuse the remaining deterministic rules (deny-list, brand token, shortener), add redaction + prompt-injection guard, then the agent endpoint; confirm contract with Fihkri before the M1 demo.
- Blocked on / needs from others: nothing.
