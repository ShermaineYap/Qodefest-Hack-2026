# How the team works (read once, 2 minutes)

Four of us, four AI agents, one repo. `team/` is our shared memory.

| File | What | Who edits |
| --- | --- | --- |
| `roles.md` | Who owns which area, and each person's git email | Each person their own row |
| `timeline.md` | Milestones and deadlines | Hana |
| `backlog.md` | Tasks, one section per person | Each person their own section (+ `requested-by` tasks for others) |
| `decisions.md` | Numbered decisions that affect more than one person | Anyone — append only |
| `log/<name>.md` | Your session log, newest first | Only you |

## Your first session

1. `git pull`
2. Check your git email is right: `git config user.email`. Your agent will add it to `roles.md` the first time.
3. Open Qoder in this repo and say "brief me". The agent reads `.qoder/rules/team-harness.md` and tells you
   your tasks, what others need from you, and the next deadline.
4. Work. When you stop, say "wrap up" — the agent logs what you did, updates your tasks and pushes.

## The three rules

1. **Edit only your own section** of `backlog.md` and your own log. Need something from someone? Add a task in
   *their* section with `requested-by: <you>`.
2. **Pull before you start, push when you stop.** Small commits.
3. **Cross-team calls go in `decisions.md`** so nobody has to ask twice.
