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
