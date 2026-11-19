---
trigger: always_on
---

# Team harness — read this before doing anything else

This repo is shared by Pattaya Fried Rice members, each working with their own AI agent at the same time.
The files under `team/` are how we stay in step. Follow this protocol in every session.

## 1. Session start

1. Run `git pull --rebase`. If it fails because of local changes, tell the user and stop — do not stash or discard their work.
2. **Work out who you are working for.** Run `git config user.email` and find that email in `team/roles.md`.
   - Not found → ask the user which member they are, then add their email to their row in `team/roles.md`.
3. Read `team/roles.md`, `team/timeline.md`, `team/decisions.md`, the user's section of `team/backlog.md`, and the last entry of their `team/log/<name>.md`.
4. Give a brief (max 8 lines):
   - their tasks that are `doing`, then `todo`, then `blocked` (with what blocks them)
   - tasks in **other** people's sections that are `blocked-by` this user or `requested-by` this user
   - the next milestone in `team/timeline.md` and how far away it is
   - any decision added since their last log entry
5. Then do what the user asked.

## 2. While working

- **Pull before every new change**, not only at session start: run `git pull --rebase` before you start editing for each new request.
  Several people and agents push here all day, so the copy you pulled earlier may already be out of date.
  - If the pull fails because of local changes, stop and tell the user. Never stash, reset or discard work.
  - If it brings in changes to files you are about to edit, re-read those files first.
  - Never undo edits with `git checkout -- <file>` or `git restore`. Another agent may be editing the same working tree.
- **Stay in your lane.** Edit only the user's own section of `team/backlog.md` and their own `team/log/<name>.md`.
  Code and docs: prefer the areas the user owns in `team/roles.md`; if a change touches another member's area, say so before making it.
- **Need someone else?** Add a task to *their* section with `requested-by: <user>` — that is the one allowed edit outside your own section. Never change status or text of someone else's existing tasks.
- **Decisions** that affect more than one person (scope, architecture, naming, tech choice) go in `team/decisions.md` as the next numbered entry, appended at the end. Never edit or delete an earlier decision; supersede it with a new one.
- `team/timeline.md` is owned by the person named at the top of that file. Others propose changes as a task in that person's backlog section.
- New tasks get the next free ID (`T-###`) — scan the whole `team/backlog.md` for the highest ID first.

## 3. Session end (or when the user says "save", "wrap up", "done for now")

1. Update the status of the user's tasks in `team/backlog.md` (`todo` / `doing` / `blocked` / `done`).
2. Add an entry at the **top** of `team/log/<name>.md`:
   ```
   ## YYYY-MM-DD HH:MM
   - Did: …
   - Next: …
   - Blocked on / needs from others: … (or "nothing")
   ```
3. Commit only this session's files with a short message (`<name>: <what>`), then `git pull --rebase` and `git push`.
   - On a conflict in `team/`: keep both sides' lines (sections are per-person, so both are almost always right), then continue the rebase. On a conflict in code you did not write, stop and ask the user.
   - Never force-push. Never rewrite shared history.

## Rules

- Small, frequent commits beat one big push at the end of the day.
- Never commit secrets, keys, `.env` files or server credentials.
- If `team/` and the user disagree, the user wins — then record the change so the files stay true.
