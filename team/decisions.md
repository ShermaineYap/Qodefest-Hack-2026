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
- Decided by: Irfan (reporting the assigned responsibilities)
- Decision: Irfan (`irfanfikhri@gmail.com`) owns the Chrome extension and its client-side backend integration. Fahreza (`fahreza@express.ai`) owns the backend and its APIs for the extension. This replaces the earlier Chrome extension assignment to Shermaine; Shermaine retains Gonka Router integration and the guardian dashboard. Other responsibilities remain unchanged.
- Why: records the assigned extension/backend split so each person and their agent work in the correct area.
- Affects: Irfan, Fahreza, Shermaine; Hana to update the end-to-end demo milestone owners.
