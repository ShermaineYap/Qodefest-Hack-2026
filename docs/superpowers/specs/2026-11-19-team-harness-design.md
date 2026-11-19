# Team harness — short design (approved 2026-11-19)

**Intent**: let the four TEAM WEB 1.5 members start working independently today, each with their own Qoder agent, without losing track of who does what or colliding in git.

**Goals**: shared roles, timeline, backlog, decisions; per-person session logs; an always-on agent rule for session start/end. **Non-goals**: tooling, scripts, dashboards, GitHub Projects. **Anti-goal**: merge conflicts on shared files when several agents push on the same day.

**Approaches**: (1) Markdown in the repo + Qoder rule — chosen: zero setup, Violet-like, agents read it natively. (2) GitHub Projects board — no file conflicts, but each agent needs `gh` auth and it drifts from the Violet style.

**Design**: `.qoder/rules/team-harness.md` (always-on) and `AGENTS.md` carry the protocol. `team/` holds `README.md`, `roles.md` (identity by git email), `timeline.md` (Hana owns), `backlog.md` (one section per person, edit only your own), `decisions.md` (append-only, numbered), `log/<name>.md` (one writer each). Start: pull, identify, brief. End: log, task statuses, small commit, pull --rebase, push.

**Left to the team**: the actual hackathon idea; real tasks (seeded ones are starters); members' git emails.
