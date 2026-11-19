# Backlog

One section per person. **Edit only your own section.** To ask someone for something, add a task in their
section with `requested-by: <you>`. IDs are global: use the next free `T-###`.

Status: `todo` · `doing` · `blocked` · `done`

## williamkee51

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-036 | Confirm your area in `roles.md` as part of the M0 ownership split | done | | | |
| T-051 | Build the demo deck: 12 slides with three interactive simulations (chat badges, warning page, assistant panel) in `deck/lantern-demo-deck.html`, plus a refreshed README runbook. Renumbered from T-044 (taken by Fihkri in parallel) and restored here after a merge dropped the row | done | | | |
| T-052 | Deck v2: add agentic-AI and real-time-detection slides, retitle slide 4 to match its three cards, and close on a "test it yourself" slide whose button opens a new click-through bench (`deck/test-links.html`) with the demo runbook linked | done | | | |
| T-053 | Add visuals to the README: a banner, real inline-badge and warning-page screenshots captured from the sim harness, and a cropped assistant-panel figure | done | | | |

## Shermaine Yap

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-037 | Confirm your area in `roles.md` as part of the M0 ownership split | todo | | | |
| T-039 | Build Ask SHOU v1: bounded check agent, standalone `panel/`, Vercel API, docs and tests (branch `ask-shou`, PR #1) | done | | | |
| T-041 | Deploy the Lantern Assistant on Vercel as `lantern-assistant` — dropped: the panel uses the gateway's `/agent/message` instead (D-014) | done | | | |

## Fahreza Alghifari

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-034 | Implement the backend: API gateway, scoring service, `/risk/link` and agent endpoints; agree the API contract with Fihkri (D-002) | doing | | Fihkri | |
| T-038 | Decide what runs on the team server and how the backend deploys | done | | | |
| T-042 | Redeploy the enclave (`./deploy.sh`) to ship the brand/deny-list floors from D-012 | todo | | Shermaine Yap | |
| T-046 | Redeploy the gateway and verify a first scam returns `new_scam` and an exact repeat returns `known_scam` through the public tunnel (D-016) | todo | | | |
| T-047 | Admin console: token-gated `POST /agent/admin/chat` (read-only SQL guardrails, summary fallback) and `/console` chat page (D-017) | done | | | |
| T-048 | Fix `/agent/message` on the live deployment: it answered `503 {"detail":"agent_unavailable"}` earlier on 2026-11-19, so the assistant panel could only show NOT CHECKED. Fixed by Fahreza's redeploy before this was pushed — the endpoint now returns `201` from the keyword mock (no model key configured), so the assistant demo works on the tunnel | done | | williamkee51 | |
| T-053 | Remove the `ADMIN_TOKEN` gate from `/agent/admin/chat` and `/console` at the admin's request; token UI, 401/503 states and the env/compose setting are gone, guardrails from D-017 unchanged (D-018) | done | | | |
| T-054 | Admin dashboard overview: KPI cards, 24h volume, verdict/novelty/client/model meters, verdict filters and expandable log on `/`, computed from `GET /agent/messages?limit=100` (D-020) | done | | | |

## Fihkri

| ID | Task | Status | Blocked by | Requested by | Due |
| --- | --- | --- | --- | --- | --- |
| T-033 | Scaffold the Chrome MV3 extension: content script, service worker, URL normaliser, warning page, assistant panel | done | | | |
| T-040 | Wire the extension service worker to `POST /risk/link` per the contract in `server/README.md` (base URL, `NOT_CHECKED` handling, no green on failure). Ask Fahreza for the current tunnel host; raise CORS/origin needs as a task if `host_permissions` is not enough | done | | Fahreza Alghifari | |
| T-043 | Reload the extension and smoke-test the side panel: a pasted message goes to the Lantern Assistant; a link shows the badge plus "Ask Lantern Assistant to explain" (D-012, D-014) | todo | | Shermaine Yap | |
| T-044 | Re-theme the warning page and side panel to `design/DESIGN.md`: tokens only, bundled IBM Plex, SVG tier marks, light/dark, reduced motion | done | | | |
| T-045 | `npm run sim`: 3 checks fail on main (IP-literal `/verify` and `maybank2u.com.my@evil-site.top` expected 🔴, scored 🟡 because their floors are 60/70; the address-bar case follows). Decide: raise those floors to HIGH, or expect MEDIUM in the sim | todo | | Shermaine Yap | |
| T-049 | Align `extension/scripts/mock-api.mjs` with the real floors: it treats `userinfo_obfuscation` and `insecure_login` as HIGH (score 90), while the live enclave gives 70 and 60 — both MEDIUM (`docs/demo-script.md` has the verified live numbers). The sim passes because it runs against the mock, so it overstates those two links. Align the mock with `server/enclave/app/rules.py`, or record in a decision why the demo mock may differ | todo | | williamkee51 | before demo |
| T-050 | Fix the side-panel leg of `npm run sim`: the badge and warning checks pass (15/15), then it times out at `scripts/sim.mjs:221` waiting for `#result`, which the chat redesign removed (D-014). Update the selectors and assertions to the chat layout, then re-run | todo | | williamkee51 | before demo |
