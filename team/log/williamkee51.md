# Session log — williamkee51

Newest first. Only williamkee51's agent writes here.

## 2026-11-19 15:20
- Did: added pictures to the README — `docs/images/banner.svg` (crisp on GitHub, matches the deck palette), fresh real screenshots of the inline badges and the warning page (`docs/screenshots/inline-badges.png`, `warning-page.png`), and a cropped assistant-panel figure (`panel-verdict.png`). The two new screenshots come from a temporary copy of `scripts/sim.mjs` writing to %TEMP%, so `extension/sim-output/` was not touched; it showed only links whose mock tiers match live, because T-049 is still open. Replaced the ASCII mockups under "What the user sees" with these images and changed "Two surfaces" to "Three surfaces" to match the table.
- Found: the sim now passes 13/13 including the side-panel leg, so the `#result` breakage in T-050 looks fixed on main (Fihkri's call to close it).
- Next: check the README on GitHub once pushed; keep the tunnel host fresh for any link in the submission.
- Blocked on / needs from others: nothing new; T-049 stays open.

## 2026-11-19 15:10
- Did: updated the demo deck after the latest pull — now 15 slides. Added "Agentic AI: it asks the right questions — then it stops" (per-turn budget table, tool allowlist, evidence ledger, mock vs model) and "Real time: before the page loads, before she clicks" (400 ms debounce, 3 s rescan, before-navigation warning, worst-wins cache, measured latencies). Retitled slide 4 to "Three ways in, one decision" — it already showed three cards. Added a final "Test it yourself" slide; its primary button opens the new `deck/test-links.html` click-through bench (HIGH address-bar links, paste-ready chat links, assistant prompts, honest-failure steps), with the runbook linked next to it. Rendered the new slides and the bench headlessly to check layout.
- Next: rehearse on the presenting laptop and re-check the tunnel host before the demo.
- Blocked on / needs from others: T-049 and T-050 unchanged.

## 2026-11-19 15:05
- Did: wrote `docs/demo-script.md` — a four-act live demo (warning page, chat badges, assistant panel, honest failure) with a link bank verified against the on-device rules and the live `/risk/link`, plus assistant replies from the gateway's keyword mock run locally. Ran the gateway/enclave locally to verify the mock path. Excluded a real-registered lookalike found during prep (`xn--pypal-4ve.com`) and substituted an unregistered homoglyph (`xn--mybank-3nf.com`). Linked the script from the README runbook.
- Found two blockers for the assistant/chat demo: the live `/agent/message` returned `503 agent_unavailable` (T-048), and `scripts/mock-api.mjs` scores userinfo / insecure-login as HIGH while the live enclave gives 70/60 MEDIUM, so the sim overstates those links (T-049, Fihkri). Also ran `npm run sim`: 15/15 badge and warning checks pass, then the side-panel leg times out on the removed `#result` after the chat redesign (T-050, Fihkri). Fahreza's redeploy fixed `/agent/message` before this push — it now returns 201 from the keyword mock, so the assistant act works on the tunnel.
- Next: rehearse the script with the team; two sim issues (T-049, T-050) remain.
- Blocked on / needs from others: T-049 and T-050 before the demo.

## 2026-11-19 14:15
- Did: built `deck/lantern-demo-deck.html` — a 12-slide standalone deck (day/night, keyboard nav, print) with three interactive simulations: chat badges, warning page, and the assistant panel with its privacy ledger. Rendered 8 slides headlessly to check layout. Refreshed the README demo runbook after D-014 (panel now uses the gateway's `/agent/message`, no Vercel) and after the sim harness landed (`npm run sim -- --headed / --live`), and corrected test counts to 21 + 29 + 11 = 61. Added T-044.
- Next: drive review of the deck and M1 status with the team; run acceptance tests 2–5 in `tests/acceptance.md`.
- Blocked on / needs from others: nothing

## 2026-11-19 13:26
- Did: took the team lead role — reviewing and managing the project's overall direction; confirmed my area in `roles.md` (T-036 done). Set the team name to Pattaya Fried Rice (D-005) and the product name to Lantern (D-006); updated the README references.
- Next: review Lantern's README and specs against the M0 decisions and drive the M0 ownership split with the team.
- Blocked on / needs from others: nothing
