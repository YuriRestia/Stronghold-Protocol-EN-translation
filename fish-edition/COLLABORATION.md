# Working together on Fish Edition

For everyone who works on this repository besides Fish: other people, and other AI agents. Fish leads. Fish's own
agents go by codenames, so nothing public says which machine is which: **orca** is Fish's second in command (online most
consistently, keeps the board below), **shark** has more raw power and works when Fish is at it. Everyone else is a
collaborator.

You can't see anyone else's session. **GitHub is how we talk:** issues, PR comments and committed files. Anything
that isn't committed or written on GitHub doesn't exist for you, and anything you only keep in your own session doesn't
exist for anyone else.

## Signing

Fish's agents act through Fish's GitHub account (`evenifyouforget`), so every comment, issue and PR description an
agent writes ends with a signature line naming the agent, e.g. `— Claude (orca)` or `— Claude (shark)`. Text without
one is Fish's. Commits by an agent use the agent's name as the author (`git -c user.name="Claude (shark)" …`).

## The work board

**The live list of who is doing what is a pinned issue titled "Work board"**, not this file (a file only changes when a
PR merges). The issue lists each line of work with:

- **Who** has it (Fish, orca, shark, a person).
- **Open to:** `anyone` (pick an item, say so in a comment first), `compute` (help by running jobs, below), or
  `keep out` (with the reason: data that isn't in git, context that isn't written down, or work in progress that would
  conflict).
- **Where it lives:** branch, PR, issue, notes.

Before starting something, read the board and comment on it (or on the issue you're picking up), so two agents don't
do the same work. A line of work that will take more than about 4 hours of continuous running, or more than about 3 days
of calendar time, always goes on the board.

## Where things live

| What | Where | Visible to collaborators? |
| --- | --- | --- |
| Code, tests, player docs | `main`, `mini/*` (PRs target the current `mini/*` branch) | yes |
| PR descriptions, changelog fragments | the PR, `changes-fish/` (#158) | yes |
| Research notes on the bots (`fish-edition/ai-players/`) | branch `wip/loop-notes-2026-11-11` until they're merged | yes, on that branch |
| Raw research data (match records, bench outputs, ML datasets: `fish-edition/untracked/`) | orca only | **no**: too big for git, or contains players' records |
| Fish's own drafts (for example `fish-edition/operator-mod-z/*.md`) | Fish's machines, not committed | **no** |

If you need something from the last two rows, ask on the issue. Don't recreate it from guesses.

## Compute jobs: help without the data

A lot of the research only needs results, not the games themselves. For bot strength, one won/lost bit per seed is
enough. Those jobs are posted as issues with the label `compute`, and anyone can run them:

1. Check out the commit the issue names (results from different code don't mix), run `npm ci`, then run its command,
   for example:

   ```
   node tools/bench-share.mjs run --a legacy --b evobot --config solo:ABYSS --seeds 200
   ```

   Leave out `--seed`: the tool picks a random starting seed, so two contributors almost never repeat each other's
   seeds (`ai-players/README.md` "Seeds"). `--jobs N` sets the threads (default: all cores but one).
2. Paste the block it prints (5 lines, about 50 characters per 200 seeds) as a reply on the issue. Nothing else is
   needed: no files, no zips.
3. Whoever posted the job collects the thread with `node tools/bench-share.mjs merge thread.txt` (any text containing the
   blocks; repeated seeds are counted once). It prints the totals, ± 1 standard deviation, and one paired sign test.

A job's issue states the commit, the command, the question, how many seeds would answer it, and when it closes.

**Jobs that produce big files** (a 1 GB zip of match records, for example) can't go through GitHub. Don't post them as
compute jobs. Ask Fish on the issue: Fish moves those files between machines by hand.

## Long and exclusive work

Some lines of work are long (an evolution race, an ML dataset, a balance sweep) or depend on files or context only one
agent has. Whoever owns such a line:

- puts it on the work board with `keep out` or `compute`, and the reason;
- writes the plan and the result in committed notes (or the issue), so someone else could pick it up later;
- splits the running part into compute jobs where possible, so others can help without the data.
