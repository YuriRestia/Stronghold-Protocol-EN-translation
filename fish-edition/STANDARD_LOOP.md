# Standard loop

The order of work for each session, or whenever Fish asks to "go through the standard loop". Do the steps in order,
skip the ones with nothing to do, and finish with the report in step 11.

Repos: **here** is `evenifyouforget/Stronghold-Protocol-EN` (remote `origin`), **Yuri** is
`YuriRestia/Stronghold-Protocol-EN-translation` `dev-0.2` (remote `yuri`), and **sganggs** is
`sganggs/Stronghold-Protocol` (remote `sganggs`). Branch rules are in BRANCHES.md, which is read only.

Until end of service (`untracked/eos-notes.md`): syncs, bug fixes and minor PRs only, plus the final SPA-CC balance
update and the DYYBot line. Nothing is synced from sganggs any more (they added SPA3, 2026-11-11); only Yuri → here.

## 1. Fetch and look around

- `git fetch --all --prune`.
- Note anything new on `yuri/dev-0.2`.
- Check where `main` (and a `mini/*` branch, if there is one) stands, and whether its last CI run is green.

## 2. Sync TODO.md with GitHub

For our repo and Yuri's, as far as our PRs and issues go:
- in-flight PRs: state, CI, reviews, and new comments since the last loop;
- issues on our repo: new ones, new comments, and ones that changed state;
- comments on our PRs on Yuri's repo.

Scope is by **milestone**, not label (Fish, 2026-11-24): "Release 0.3.4-3" (due 2026-11-30), "-4" (12-14), "-5" (12-31),
about a two-week cadence. Every PR and every issue the release means to fix gets the milestone of the release it is
aimed at (`gh pr create --milestone "Release 0.3.4-N"`, or `gh api -X PATCH repos/…/issues/N -F milestone=<number>`).
Each loop, move what has slipped to the next milestone and adjust the scopes to what was realistically done; items that
wait on Fish or aren't planned have no milestone.

Bring TODO.md up to date: drop what is done, add new open work under its heading and in "What blocks what", and keep
each fact in the one place TODO.md's table names. Findings go on the GitHub issue or in the file the item points to,
not in TODO.md. If a comment on Yuri's repo needs an answer, draft it (in the scratchpad or `untracked/`) for Fish to
post. Our token can't post there.

## 3. Close issues that are already done

Close an issue when its fix has reached `main` but GitHub didn't close it, for example because the "Closes #N" line
was missing from a mini → main squash message. Comment with the PR that fixed it. An issue whose fix is still only on
a mini branch stays open.

## 4. Maintain in-flight PRs

For each open PR on our repo:
- red CI: find the cause and fix it, or say why it's unrelated (a known flake, an environment failure);
- merge conflicts: merge the base branch in;
- keep the description and labels current. Labels always include `drafted-by-ai`, never `playtested`;
- a PR that adds or rewords text players see gets a blind read before it's ready (`PLAYER_TEXT.md`: the style rule, the
  prompt, the log), with the result in its description;
- close it if a recent change made it irrelevant, with a comment saying which change.

PRs on Yuri's repo: report what needs doing and ask before pushing to their branches.

## 5. Clean out pr-descriptions/

Delete a file in `pr-descriptions/` when its PR is merged or closed. Git history keeps the file, and the PR on
GitHub keeps the text.
- Find the PR from the file's "Branch `…`" line: `gh pr list --repo <repo> --state all --head <branch>`.
- Keep a file whose PR is still open, and a file that hasn't been made a PR yet.
- Keep the newest merged file of each kind as the template for the next one: today `mini-0.3.3-1.md` (mini → main)
  and `sync-yuri-2026-11-18.md` (Yuri → here). When a newer one of the same kind lands, it becomes the template and
  the old one goes.
- If a file has no "Branch" line, add one while you're there, or ask Fish if it's unclear what the file belongs to.

## 6. Sync Yuri → here, if needed

When Yuri's `dev-0.2` has moved on, merge it into a `wip/sync-…` branch from `main` (or the current mini branch). Use
a real merge commit, so the next sync can be a plain `git merge`. Keep both sides, regenerate goldens and generated
data instead of hand-editing `data/*.json`, run the full `npm test`, and write the description (conflicts and how
they were resolved, known issues, tests).

## 7. Sync here → Yuri, if needed

Our display-only changes that Yuri doesn't have yet go up as `yuri/*` branches cut from `yuri/dev-0.2`, one strict
scope per PR. Offer each one to Fish with its description. Fish opens PRs on Yuri's repo.

## 8. Urgent items

Bugfixes and anything else that blocks players or server owners get a PR before new feature work.

## 9. Fish's other requests

Features, research, and questions.
- Dev work targets the current `mini/*` branch where possible. Those PRs run quick CI only.
- Keep one audience per PR: upstream-friendly display changes apart from fork-only gameplay mods.
- Log every answer to a question in a file, not only in chat:
  - questions about the bots go in `ai-players/`;
  - other answers go on the GitHub issue, or in the file the TODO item points to;
  - Fish's own questions and scenarios are in `MISC_USER_QUESTIONS.md`.
- When an item is done, remove it from TODO.md (or tick Fish's own checklist items, with where the answer is).

## 10. Commit the notes

- Everything in `fish-edition/` is committed or gitignored (`untracked/`, `images/`). `git status fish-edition/`
  should show nothing at the end of the loop.
- Commit Claude's edits as Claude. Fish commits Fish's own planning edits.
- When the loop changed notes that belong in the mini branch, put them in a `wip/loop-notes-<date>` PR into it, with a
  description file in `pr-descriptions/`.
- When the mini branch is ready for `main`, open the mini → main PR (title, changelog, `Closes` lines, known issues).

## 11. Report

Tell Fish, in short:
- what changed on GitHub since the last loop;
- what was done in this loop, with links to any PRs opened;
- what needs a decision, playtesting, or an action only Fish can take (posting on Yuri's repo,
  merging, anything outward-facing);
- what's next.
