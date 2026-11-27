Who is working on what. Rules: `fish-edition/COLLABORATION.md`. Comment here (or on the item's issue / PR) before you start something, so two of us don't do the same work. Kept up to date by orca.

**Scope:** GitHub milestones (about a two-week cadence): [Release 0.3.4-3](https://github.com/evenifyouforget/Stronghold-Protocol-EN/milestone/1) (due 2026-11-30; the working name is `mini/0.3.3-2`), [0.3.4-4](https://github.com/evenifyouforget/Stronghold-Protocol-EN/milestone/2) (12-14), [0.3.4-5](https://github.com/evenifyouforget/Stronghold-Protocol-EN/milestone/3) (12-31). They replace the old `mini-…` labels; an item's milestone says which release it is meant for (not final; it moves).

**Open to:** `anyone` = pick it up after saying so; `compute` = help by running jobs (`compute` label); `keep out` = needs files or context that aren't in git, or would conflict.

## Good to hand over (orca's pick, 2026-11-19)

Ranked for a machine with many cores and, ideally, a browser. Each one works from git alone.

1. **Browser checks** (anyone with Chrome; orca's container has none). Run the browser tests and look at the new UI, then post what you see (screenshots welcome) on the PR:
   - `yuri/improv-view-fields` (#153's port for Yuri's repo): `SP_E2E=1 node --test test/ui/improv-peek.e2e.test.js`. It has never run anywhere.
   - #170 (auto-award): the AUTO chips on the end screen and the Risk tab's list. A solo match with the rule on and nothing else ends with Swift and Foresight awarded.
   - #168 (merged): the AI profiles popup's scores.
2. **SPA-CC grinder runs** (#124 level 3, `compute`). The sets and commands are in `fish-edition/spacc/grinder-definition.md` "Running a set" (branch `wip/loop-notes-2026-11-11`), and they need `tools/bench-share.mjs --rules` (#171). The useful run is the four scored sets (H5, H10, F9, C3) at 1,000+ seeds each, legacy vs evobot: about 8,000 solo matches (~45 CPU-hours: 2 to 3 hours on 24 threads). Post the blocks on #124.
3. **Strength numbers for the AI profiles popup** (#124 levels 1–2): shark's 300 more seeds per mode are in #178 (evobot's team number 78 → 71). Fish Level hasn't been re-measured.
4. **ML / decision-point research** (Fish's 2026-11-16 direction: learn from decision points). orca's data (match records, the evolution race cache, the surrogate) travels as the bundle `orca-ml-2026-11-19` via Fish; its `ORCA-ML-BUNDLE.md` lists the lines of work and what to send back. Claim a line here first. **shark has returned line 1** (the shop buy/skip decision-point dataset, 102,839 rows, with an extractor and 600 labeled legacy / evobot records; received and checked by orca 2026-11-20, summary in `ai-players/11`; the data stays off git). orca started the same line by mistake on 2026-11-19, stopped it, and offers its 2,197 legacy records. **orca has line 3** (race-cache mining, claimed 2026-11-19). Lines 2 (re-seeded takeovers) and 4 (imitation) are open.

**Not good to hand over:** SPA-CC balance (the sweeps' data stays on orca), the Yuri syncs and Mod Z.

## Lines of work

| Line of work | Who | Open to | Where |
| --- | --- | --- | --- |
| Current mini release `mini/0.3.3-2` (opened 2026-11-18): syncs, bug fixes and small PRs; scope in `fish-edition/TODO.md` | Fish, orca | anyone (small PRs to `mini/0.3.3-2`, milestone Release 0.3.4-3) | merged: #166, #167, #168, #170, #171, #173, #178, #179, #182; open: #181, #184, #185, #186, #187 |
| Auto-award free Risk tags (#125) | orca | phases 1 and 2 merged (#170, #173); Low Efficiency waits on Fish | #170, #173 |
| SPA-CC grinder (#124 level 3): the rubric, its tag sets, bot runs | orca (rubric, co-op sets running now), anyone (runs) | compute | `fish-edition/spacc/grinder-definition.md`, #124, #171 |
| Cards display overhaul (#125's look) | orca, Fish | keep out (Fish's in-game feedback first) | `fish-edition/spacc/cards-overhaul.md` |
| SPA-CC clears tracking | orca | anyone can share records with Fish | #121 (refreshed 2026-11-18 from 277 matches) |
| Bot strength numbers (#124 levels 1–2) | shark | compute | #124, #168 |
| Bot research: tactics, evolution, ML | orca, shark (via the bundle) | compute (strength runs); ML lines: claim one here (bundle `orca-ml-2026-11-19`) | branch `wip/loop-notes-2026-11-11`, `fish-edition/ai-players/` |
| SPA-CC balance (last update before the end of service) | orca | keep out: the sweeps' data is only on orca | `fish-edition/spacc/`, TODO.md "SPA-CC" |
| Mod Z / Mod W draft | orca | keep out: Fish's designs aren't committed | #142 (in 0.3.3-1) |
| Collaboration setup: this board, `COLLABORATION.md`, compute jobs (`tools/bench-share.mjs`) | orca | anyone: comments on the doc welcome | #162 (merged), #171 |
| Syncs from Yuri's repo into `main` | orca | keep out | — |
| Bots moving to the browser (Yuri) | Yuri | keep bot code deterministic and browser-safe | Yuri's repo |

**Done:** 0.3.3-1 released (#163, 2026-11-17); changelog fragments (#160); the Mod Z bots study (`ai-players/12`: bots can't judge Mod Z balance).

The project is in its end-of-service feature freeze (until about May 2027): only syncs, bug fixes and minor PRs, plus the planned SPA-CC update and the DYYBot line.

— Claude (orca)
