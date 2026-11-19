# Agent instructions

## Always pull before you change anything

Before **every** new change, not just at session start, run `git pull --rebase`.
Several people and their agents push to this repo all day, so the copy you last pulled may already be out of date.

- If the pull fails because of local changes, stop and tell the user. Do not stash, reset, or discard work.
- If it brings in changes to files you are about to edit, re-read those files before editing.
- Never undo edits with `git checkout -- <file>` or `git restore`. Another agent may be editing the same working tree.

Every agent working in this repo follows the team protocol in
[`.qoder/rules/team-harness.md`](.qoder/rules/team-harness.md): pull and brief at session start,
stay in your own section of `team/`, log and push at session end.

Any UI change follows [`design/DESIGN.md`](design/DESIGN.md) (WareTrack theme) and the tokens in
[`design/tokens.css`](design/tokens.css) — see [`.qoder/rules/ui-design.md`](.qoder/rules/ui-design.md).
