# Decisions

Append only. Number each entry. To change one, add a new entry that supersedes it.

```
## D-### — YYYY-MM-DD — <title>
- Decided by: …
- Decision: …
- Why: …
- Affects: …
```

## D-001 — 2026-11-19 — Coordinate through `team/` in the repo
- Decided by: team
- Decision: Roles, timeline, backlog, decisions and per-person logs live as Markdown in `team/`; every agent follows `.qoder/rules/team-harness.md`.
- Why: lets everyone start working independently today without a separate tool, and per-person sections keep git conflicts rare.
- Affects: everyone

## D-002 — 2026-11-19 — Chrome extension and backend ownership
- Decided by: Fihkri (reporting the assigned responsibilities)
- Decision: Fihkri (`irfanfikhri@gmail.com`, GitHub `Fikhri02`) owns the Chrome extension. Fahreza Alghifari (`fahreza@express.ai`) owns the backend and its APIs for the extension.
- Why: records the assigned extension/backend split so each person and their agent work in the correct area.
- Affects: Fihkri, Fahreza Alghifari

## D-003 — 2026-11-19 — Team roster is the four people in the README
- Decided by: Fihkri
- Decision: `team/` follows the roster in the README: williamkee51, Shermaine Yap, Fahreza Alghifari and Fihkri. Sections, logs and tasks for Daniel, Hana and Liaw are removed; they described people who are not on this team and an earlier project scope. Areas not yet assigned stay "to confirm" in `roles.md` until M0.
- Why: keep `team/` and the README describing the same team, without inventing ownership.
- Affects: everyone

## D-004 — 2026-11-19 — D-002 stands as currently recorded; append-only from here
- Decided by: Fihkri
- Decision: D-002 stands with Fihkri (`irfanfikhri@gmail.com`) as Chrome extension owner and Fahreza Alghifari as backend owner. The current D-002 text supersedes the earlier wording that named Irfan and referenced Hana and Shermaine. Future changes to a decision are added as a new numbered entry, never edited in place.
- Why: the D-002 edit was committed in 545954f before it could be restored; this records the corrected state without rewriting shared history a second time.
- Affects: everyone

## D-005 — 2026-11-19 — Team name is Pattaya Fried Rice
- Decided by: williamkee51
- Decision: the team is called **Pattaya Fried Rice**, replacing "TEAM WEB 1.5" in the README, `team/` docs and the harness rule.
- Why: the old name was a placeholder from the earlier four-person roster and no longer matches the team.
- Affects: everyone

## D-006 — 2026-11-19 — Product name is Lantern
- Decided by: williamkee51
- Decision: the product is called **Lantern**, replacing "Link Guard". The panel is the **Lantern Assistant**; "passive link guard" stays as the feature description.
- Why: Lantern carries light into what a link or page is really doing — protection plus an agent to ask about hidden or unclear features — without the fear framing of "guard".
- Affects: everyone — use "Lantern" in the UI, docs, pitch and repo references.

## D-008 — 2026-11-19 — `/risk/link` contract v0.1 matches the extension's `RedactedPayload`
- Decided by: Fahreza Alghifari
- Decision: The scoring API accepts the extension's `RedactedPayload` (`extension/src/types.ts`) and returns `{request_id, tier: low|medium|high, score, headline, sentences, checked, category, held_for_review, checks}` — the exact shape `extension/src/background.ts` parses. The raw URL never crosses the network. Behavior is fail-closed: any non-2xx (e.g. `503 {"detail":"enclave_unavailable"}` when the enclave is down) makes the extension render NOT CHECKED, never green. Contract: `server/README.md` (v0.1).
- Why: the extension and its mock already define this contract; aligning the server keeps redaction on-device and requires no changes to Fihkri's working client.
- Affects: Fihkri (T-040), Fahreza Alghifari (future contract changes are appended here first)

## D-007 — 2026-11-19 — Backend deployment: Docker Compose + gateway/enclave split
- Decided by: Fahreza Alghifari
- Decision: Backend deploys as two FastAPI services via Docker Compose on the team server (172.104.41.120): `gateway` on :4000 (the only public surface) and `enclave` on :3100 (compose network only, never routed). An internal nginx routes `/risk/*`, `/agent*`, `/health`, `/api/ping` to the gateway; public traffic arrives through a Cloudflare quick tunnel, so no inbound HTTP ports are open (ufw allows SSH only). Code lives in `server/`; the contract and deployment runbook are in `server/README.md`. The extension calls `${BASE}/risk/link` — spec paths unchanged.
- Why: matches the README architecture (gateway transport-only, enclave isolated), keeps scoring off the public internet, and needs no firewall exposure while the hostname is still a quick tunnel.
- Affects: Fihkri (extension base URL + T-040), Fahreza Alghifari (deploys)
