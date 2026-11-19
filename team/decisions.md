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
