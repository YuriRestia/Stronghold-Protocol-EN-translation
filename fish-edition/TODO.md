# TODO

Open work only, grouped by what blocks what. Each fact has one home, and this file only points to it:

| What                                       | Where it lives                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Done work                                  | git history, merged PRs, CHANGELOG (not this file)                                          |
| An issue's discussion and findings         | the GitHub issue                                                                            |
| Bot research and answers about the bots    | `ai-players/` (index: `ai-players/README.md`)                                               |
| SPA-CC tags, numbers and status            | `spacc/working-spec.md`; design decisions in ROADMAP.md "SPA-CC"                            |
| The 2026-11 balance draft and its evidence | `untracked/spacc-balance-update.md` (Fish's draft), `untracked/balance-2026-11/findings.md` |
| End of service                             | `untracked/eos-notes.md` (the decision, the freeze table, the banner text)                  |
| Mod Z designs                              | `operator-mod-z/`                                                                           |
| Ideas and designs not built                | ROADMAP.md                                                                                  |
| Branch rules / session order               | BRANCHES.md / STANDARD_LOOP.md                                                              |
| Fish's scenarios                           | MISC_USER_QUESTIONS.md                                                                      |

**Feature freeze** (eos-notes): only syncs, bug fixes and minor PRs, plus the one final SPA-CC balance update and the
DYYBot line. No more sganggs syncs (they added SPA3, 2026-11-11); Yuri → main syncs only.

## What blocks what

```
SPA-CC final balance update (#31, #92)
  bot sweeps, stand-route fix, Halley replay, verdicts .. done (spacc-balance-update.md)
    └─ Fish's changes of 2026-11-12 (3 Silencers, Patriot, Delegation; United 3 gate 15 %) .. re-swept, verdicts written
         └─ #131 merged into the balance branch (63f6d6d6) ✓
              └─ Fish: read the 2026-11-12 verdicts (Undying 3 = Undying 2 for bots; United 2 = United 3 for bots) ← next
                   └─ #125 (ok'd), same patch: needs Fish's choices (option name, how awarded tags show)
         └─ spacc/working-spec.md, full test suite, PR into main

Evolution bench ............................ built and effective (tools/evolve.mjs; ai-players/07); iterated racing --race (ai-players/10), first real race queued (queue9)
  first tactics: no real gain over legacy; bigger tactics needed (DYYBot, team play)
  ├─ bot research: "try it in the evolution bench"
  ├─ DYYBot step 5 (05-dyybot.md "Process")
  └─ Mod Z: "try the evolution bench", then the report

DYYBot (#135, draft)
  step 1: human games vs the draft, legacy's games vs the humans' .. done (05)
  ├─ forced-Du-Yaoye baseline + the draft, 160 seeds .. done (05: no win difference; early levels cost the board)
  └─ step 3 tactics: `plan-iso` measured: no gain (inert at level 5; level 6 from round 11 costs 20 → 12 wins, Isomorph adds nothing)
       ├─ `dyy-muelsyse` + the `dyybot` profile (c2b1b386): keep Muelsyse, copy her with 画卷, level 6 only with her held. queue21: 160 seeds + a scenario
       └─ then the roll-down
       └─ step 5 evolution: on Fish's PC (one command, one zip)
```

## SPA-CC

Fish's list (2026-11-11), with where each item stands. Details in `untracked/balance-2026-11/findings.md`.

- [x] Use bots to estimate values of existing tags: #31 (`ai-players/04`, `untracked/tag-sweep/`). Bots got much
      stronger since, so the tags the draft doesn't touch need a fresh sweep.
- [x] Draft balance patch on a branch: `feature/spacc-balance-2026-11` (worktree `sp-sync2`, pushed, no PR). It has
      Fish's comments of 2026-11-11: Cleaner back to 5, the Degenbrecher at the round's start, the linked HP, 200/300/500 %.
- [x] Use bots to estimate values of rebalanced tags: 80 seeds each, `balance-2026-11/analyze-2026-11-11.md`.
- [x] Point out which nerfs are too small and should be undone: the verdicts in `spacc-balance-update.md`.
- [x] Point out which nerfs are too big: same (Delegation United 2/3 in co-op).
- [x] Estimate values of rebalanced tags vs the Ult+26 game: `balance-2026-11/halley-branch2.md`, with the stand-route
      fix.

Branches that feed into it:

- `feature/bot-take-patriot` (`fish-patriot`, a legacy bot that always takes Patriot): pushed, no PR, merged into the
  balance branch. It is a bench-only profile.
- `fix/spacc-subwave-stand-route` (pushed, no PR):
  - **The bug, also on main:** a risk sub-wave unit could take a leader's standing route (wait 500 s), so it stood still.
    This is why United 2's Hidden Core took ~510 s in the Halley replay. In Halley's real game the Degenbrecher and
    the Reid stood still all Hidden Core.
  - Merged into the balance branch. It could also go to main as its own bug-fix PR (Fish's call).

Also open: #47 (Patriot targetable while invulnerable), #48 (Blood Debt icon), #121 (clears tracking issue;
`untracked/spacc-clears.mjs` regenerates it). #125 and #131: "Scoping under the freeze".

## Bots

Allowed under the freeze: DYYBot, its siblings, and the research already started (no new bots). Keep bot code
browser-safe, deterministic and cheap: Yuri is moving bots to the browser.

- **DYYBot:** draft PR #135 (`feature/fish-dyy-profile`, worktree `sp-dyy-wt`; it merges the research branch). The
  steps are in `ai-players/05-dyybot.md` "Process"; where it stands is in "What blocks what".
- **#129 `legacy-layered`:** the tuning run of its 35 parameters (botbench `--profile`, small saved chunks,
  held-back seeds) has not been started.
- **Research tactics and the evolution bench:** `ai-players/07`. Branch `feature/bot-tactics-research`, in #135. Next: bigger tactics (DYYBot), a 4-player run (`ai-players/06`), `--pool legacy` (#129's tuning).
  Whether to PR the bench into main is Fish's call (bench-only code, no bot behaviour change).

Fish's bot research list (2026-11-11):

- [x] Write new tactics based on legacy or other existing classical bots: 9 in `ai-players/07`
- - [x] Simplifcations of existing tactics' behaviours
- - [x] Variations of existing tactics' behaviours (different code, not what can be accomplished with just parameters)
- - [x] New tactics that could supplement existing tactics
- [x] Determine if any data sharing model is needed, other than actions. Yes, at the boundary to legacy
      (`ai-players/07`). (ex. if board placement step needs to know who the carry is, this may force the tactic to be monolithic and unable to be broken up, unless every tactic replicates that carry dps logic OR a new form of data sharing is introduced)
- [x] Try it in the evolutionary auto-tuning bench (3 runs and a confirmation: `ai-players/07` "Answers")
- - [x] Answer: Did the most fit strategy win significantly more? No: at most +2–3 points, not significant on 600 seeds.
- - [x] Answer: Did the most fit strategy actually make use of evolution, or was it reachable with only parameter tuning? Neither helped.
- - [x] Answer: Is the evolution bench effective? If not, can we improve it to make it effective? Now it is (resampled, paired); the tactics are too small.

Bot issues still open: research #29, #115; the rest are in "Scoping under the freeze".

- [ ] Break up legacy tactics to be less monolithic, so there are more opportunities to build on it.
      Started (2026-11-12, `feature/bot-plan-tactics`): `legacy-rules` switches 12 of legacy's named rules off one by
      one (trade, layer refresh, pager seat, custom-operator level step, focus steps, full-board gate, shop items only
      for merges, the Isomorph rules, Final Assault item hunt); all on is legacy. A new decision point `finishLayout`
      runs after the rehearsed layout. Next: more rules, and race legacy with each one off.

To make sure we are making use of the shared data:

- [ ] For each variable in the internal state, add at least one tactic that writes it
- [ ] For each variable in the internal state, add at least one tactic that reads it and does something with that information

We should also look at any other resources that human players have access to but bots currently are not using.

- [ ] Add tactics that equip alternate operator skills
- [x] Add tactics that equip custom operators
      `diy-picks` (c72a5eea): picks at match setup, defaults Ch'en the Dawnstreak S3 + Shu S3 on tier 5; the pieces go
      into legacy's buy / keep plan (without it bots never bought them). queue13: no win change (23–27 vs 27); the
      pieces arrive around round 11, too late.
- [ ] See if there are other actions/information that humans could use, and try writing tactics that use them
      Found (`ai-players/08` "The economy gap", clean games): humans buy and sell 25.6 operators a game in the same prep
      (bots 3.1), as fuel for per-gain / per-spend stackers (Dusk, Grain Buds, Astgenne); 2× the merges; 13 shop items
      (bots 0.6); the Isomorph worn with an Alliance item in 60 % of seats (bots 14 %). `cycle-econ`: no gain (23–26 wins
      vs 27, queue14): bots seldom have a stacker deployed for the cycle to feed.

Long-term goals:

- [ ] Be able to generate high stack counts. Why do the bots suck so much at generating 200+ stacks???
      Answer so far (`ai-players/08`): the gap opens from round 7. Most of it is prep-time stack operators the bots rarely
      deploy (空弦, 断崖: 7× and 19× less often) and consumables they never buy, not cycling. `plan-engines` measured: the bots
      deploy them 2–8× as often, but stacks rise ≤ 3 % and wins drop (27 → 22 of 40). `plan-items` (buying
      consumables) is the first that moves stacks: +7–10 % at round 13 (records' median 156 → 216), leader damage +15 %, same
      wins, a little less defence. The leak allowance is queued.
- - [ ] Study some selected high-stack human games in more depth. What are they doing that the bot is not doing?
- [ ] Be able to play Investor. Just my intuition, but this seems like the strategy the bots are least capable of doing. Studying human games may be enlightening.
      Confirmed (`ai-players/08`): Investor is active in 30 of 62 human seats and 1 of 111 bot seats; 67 bot seats
      never hold an Investor operator. First tactic `plan-bond` (branch `feature/bot-plan-tactics`): the 40-seed grid shows it does not help (27 → 26 / 22 wins, more leaks, same stacks). Next: the Bench-timing tactic.

Small tweaks may be possible:

- [x] Always buy Minimalist. He costs 1 and sells for 1, so there's basically no downside? Just sell him if you want your 1 Funds back. You can even do it immediately, and that already adds 1 buy counter for buy triggers and 1 sell counter for sell triggers.
      `buy-minimalist` (c28b9878): every Minimalist shown is bought; `mode: cycle` sells him at once, `merge` keeps a
      pair for the merge. queue17: 26 (cycle) / 29 (merge) wins vs legacy 27, not significant.
- [ ] Kjerag: take Ascalon as custom operator with skill 2, give her Kjerag Nevermeltice to trigger a lot of Frozen
      `diy-picks` `t6a: ascalon` (1db55e37): Ascalon S2 on tier 6; while she is owned, Kjeragi Nevermeltice goes into
      legacy's item buy / keep list (its freeze chance is a global buff, so the carrier doesn't matter). queue17: 29 vs 27, n.s.
- - [ ] You know you can also get Nevermeltice from Kjera, right? on obtained?
- - [ ] Also Ascalon is typically equipped on tier 5 to avoid diluting the tier 6 pool and so she can be obtained earlier
- [x] Commit to Aegir if got Gladiia
- [x] Commit to Laterano if got Mostima or Executor the Ex Foedore
- [x] Executor Alter > Ines on field if Foresight is active
- [x] Commit to Yan or Arcane if got Dusk
- [x] Take Yu and field Yu (for most boards) (just to generate operators)
- [x] Commit to Kjerag if got Silverash Alter and have 3 Kjerag operators
      The six above: `plan-commit` / `plan-keepers` (76694da7). Alone each is neutral (27 → 27 wins of 40); all three
      tweak tactics together lose (20, p 0.04). In the evolution pool one by one (`ai-players/08`).
- [ ] Activate 2 Marvel if we have space, to make refreshes much more efficient (especially for Siracusa)
      (`plan-bond` with `bond: miraShip` covers it without a new tactic; queue17: 23 vs 27, n.s.) (nice)
- [ ] Put Archetto behind an operator with desirable alliances (this is a lowroll method compared to more efficient stack generators)
      (legacy's layout already scores this trait, `positionTraitsOf` `pos`; to check in the records how often it lands) (nice)
- [x] Yan/Investor: Have Swire in inventory and don't sell unless it's the boss round. Her passive income is great
      (`plan-keepers` `swire`)
- [ ] Other tactics that make better use of specific Operators
- [ ] From the economy gap (`ai-players/08`): `cycle-econ` buys and sells in the same prep to feed stackers
      (queue14); still to draft: shop items beyond `plan-items` (Alliance Coin, Mimic Matter, Originium Solvent),
      and an Isomorph + Alliance item on the main carry (`carry-iso`, queue16)

Also, I don't know how the current board layout works, but I suspect there may be better placement strategies:
How it works, and each idea against legacy and the records: `ai-players/09`.

- [x] Laterano specific: put Mostima next to an ammo user
      `place-ammo` (1b9d63b8): after the rehearsed layout, Mostima moves beside the most operators with ammo skills
      (7 in the game, 5 of them Laterano); legacy's layout couldn't see this battle-time trait. queue17: 29 vs 27
      (2 seeds changed, n.s.).
- - [ ] and also Civilight next to Mostima if both are available
- [ ] Kjerag specific: maximize overlap between freeze area and "on freeze, + stack" range
- [ ] Kjerag specific: do not have a tile in front (earlier in path) that can be frozen but doesn't generate stacks
- [ ] Put Civilight behind a stack generating Operator
      Copiers in general (Ptilopsis, Saria, Civilight…): `place-copiers` (6fe043c0) puts a copier on the tile behind
      a partner, facing it. Humans do this about half the time, legacy 5–15 %; with it 38 % (Ptilopsis) and 71 % (Saria).
      Wins unchanged (24 vs `plan-combos` alone 24, legacy 27; queue15).
- [ ] Kazimierz specific: Fartooth + Blemishine combo (or Fartooth + Degenbrecher is even better)
- [ ] Aegir specific: build a snake with the dps operator at the back
- [ ] Aegir specific: can use a non-Aegir dps operator if they are given damazti isomorph + aegir equipment
      (Fish 2026-11-12: the point is a huge buff for the carry at the start of the snake. Humans' Ægir carriers:
      Pramanix the Prerita, Exusiai the alter, Archetto, Sakiko. `carry-iso` (fc1bc1d2) puts a held Isomorph + the focus
      Alliance item on the main damage dealer. queue16: never fired, because legacy equips a new Isomorph
      at once, before the item arrives. Now the carry is planned and kept across rounds, and either
      item may go on first (Fish: "humans may equip either item first to reduce inventory pressure"; 176fb58c,
      `order: either`, default), or both together (`order: hold`). queue18 measures hold, queue19 either. Placing that carry at the snake's start is still to do.)
- [ ] General boss board strategy focusing on a carry dps and making sure they get the maximum buffs/healing and are not on a pathable tile if possible (so put them on a ranged/fence tile) (you may actually be able to identify a favourite tile for each carry dps. if you place the dps first, the favourite tile is always available)

Possibly useful for testing:

- [ ] Set up a scenario where the game already starts with 1 Muelsyse (or gifts it on round 7), to see if the bots know how to scale from there (like how human games clone Muelsyse to make many Damazti Isomorph)
      `botbench --scenario FILE` (d083044b, `tools/scenario.mjs`): gifts of operators, items or funds at a round's prep
      start, through the game's own gain path (Muelsyse's on-gain Isomorph arrives too). The Muelsyse run is next.
- [ ] Other scenario tests, which make it possible to test if a tactic is useful even if it would only be relevant to 5% of games happening by chance
      Fish (2026-11-13): many more scenarios, like puzzles / unit tests (e.g. 6 Ægir operators: does the bot build the
      snake? Fartooth + Blemishine: does it combo them?); and, like integration tests, start from a human game's state
      (round 7, 10 or the final boss) and see if the bot can take over and win. Only the original seed compares with
      the human game; other seeds compare with each other. The first scenario for DYYBot is in queue21 (`mu-scroll`).

Composite score:

- [ ] May be useful as additional signal for auto-tuning, not just win/loss. Maybe something like, up to +20% bonus for killing the final boss fast, up to +10% awarded for having many total stacks (regardless of overall win/loss), +10% awarded for losing less LP before the final boss round. If research already says this is useless, we don't need to use it as a fitness metric. Maybe only or diagnostics.

## Mod Z

Designs in `operator-mod-z/` (Fish's, uncommitted). Mod Z is new gameplay, so it may not fit the freeze: Fish's call.

- [ ] Attempt to draft these mod Z's on a branch
- [ ] Hypothesize what would make each mod Z good
- [ ] Draft bot tactics that would make use of those mod Z
- [ ] Try the evolution bench
- [ ] Report on if the new mod Z's are underpowered, about right, or overpowered

## Bugs (allowed under the freeze)

- #116 Blaze's skill can't be changed.
- #120 the changelog's "NEW" area still shows 0.3.0 and the Sakiko announcement.
- #122 the Degenbrecher's stacks come on deployment, not on skill activation.
- #123 the LP lost shown top right and in the round announcement leaves out Last Line's −2.
- #47, #48: under SPA-CC above.
- #90 Du Yaoye's 2nd refresh:
  - not reproduced in code or in the 2026-10-27/28 replays;
  - a record logs the shop before the trait (server/match/records.js `shop`), so logging it after onRefresh too would
    settle the next report;
  - the issue has no comment yet, so this analysis is only here. Worth posting it there.
- Leftovers of #98–#100:
  - tools/package.mjs doesn't put server-info.json in release zips;
  - docs/PLAYING.md (upstream's, Chinese) still links sganggs's issues;
  - the title screen's Discord button still points to stronghold-en.dev's community.
- Leftover of #88: Strategy 2's three Strategy changes (Ioleta, Du Yaoye, Amiya) aren't in their texts.

## End of service

Everything is in `untracked/eos-notes.md`. Open:

- the banner switch and the static EoS page, both with the default message preloaded (Fish: commit them closer to the
  time);
- the translations once Fish's EN text is final;
- the repos' README notice.

## Scoping under the freeze (GitHub, 2026-11-12)

Every open issue and PR on the fork that isn't a bug (bugs are allowed: "Bugs" above). For Fish to mark **ok**
(done despite the freeze) or **no** (not doing: close, or label and leave). Sizes are my guesses. Closed on
2026-11-12: #33, #34 (no), #36, #52, #71, #72 (answered).

|           | What                                                   | Kind           | Size         | Note                                                                                                                                        | Fish |
| --------- | ------------------------------------------------------ | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| #131      | promoted operators ignore the 300k damage cap          | gameplay       | small        | Fish and Halley want it as a feature; could go into the balance patch                                                                       | ok   |
| #132      | popup with the operator copies left in the shared deck | UI             | medium       | shows what only the bots' pool stats see today                                                                                              | ok   |
| #133      | cheat: Transmitter+                                    | cheat          | medium       |                                                                                                                                             | ok   |
| #134      | cheat: Damazti Isomorph+ (more item → Alliance pairs)  | cheat          | medium       | Claude's draft of the pairs is on the issue, for Fish to correct                                                                            | ok   |
| #125      | lobby option to award free tags automatically          | SPA-CC feature | small–medium | you should also sanity check the definitions yourself to make sure the free award condition actually guarantees it would make no difference | ok   |
| #128      | bots equip custom operators                            | bot research   | medium       | also in Fish's bot list above; 4 of 15 human Du Yaoye seats used one (05)                                                                   | ok   |
| #124      | how strong each bot is                                 | bot research   | small        | botbench runs exist (05, 07); needs a write-up                                                                                              | ok   |
| #117      | rehearsals: bonus for clearing a round quickly         | bot feature    | small        |                                                                                                                                             | ok   |
| #87       | show AI players' personality                           | UI             | small        |                                                                                                                                             | ok   |
| #118      | public username in the profile, in match records       | feature        | medium       | explicitly opt-in (Fish; noted on the issue)                                                                                                | ok   |
| #105      | pull down the improv overlay to see boards             | UI             | medium       |                                                                                                                                             | ok   |
| #104      | replays rich enough to continue a match mid-way        | feature        | large        |                                                                                                                                             | ok   |
| #93, #121 | SPA-CC balance reporting; clears (tracking)            | tracking       |              | keep while SPA-CC is live?                                                                                                                  | ok   |
| #135      | DYYBot draft + research tactics (draft PR)             | bots           |              | allowed (DYYBot line)                                                                                                                       | ok   |

## Needs Fish

- **Scoping under the freeze:** the table below.
- **Bot findings post** (`untracked/bot-findings-post.md`, written for an issue on sganggs's repo): post it elsewhere,
  or drop it now that there are no more sganggs syncs?
- **Lobby rules and SPA-CC for Yuri:** Fish asked Yuri on 2026-10-16 whether gameplay mods are welcome as dormant
  code. Is this still wanted with EoS coming?
- **Merge commits for sync PRs:** the repo merges by squash only, so every sync needs a hand-picked merge base.
  Allowing merge commits would make the next sync a plain `git merge`.
- **Stale branches:** many `wip/*`, `yuri/*` and `wip/loop-notes-*` branches are merged or dead, locally and on the
  fork. They could be pruned. `wip/sync-yuri-0.2.6` is the one known stale branch.
- **The old `wip/3` notes stash:** `git stash` `stash@{0}` "wip/3: remove-before-merge/ edits …". It can be dropped
  once you've checked it.

## Parked

- Stale browser data / "3D unavailable" (2026-10-10):
  - parked by Fish on 2026-10-16;
  - lead: version-stamp the 1-day-cached URLs per build;
  - ask for the console line `[field] render engine unavailable` next time.
- Visual overhaul (particle engine, effect extraction): a new feature, frozen.
- Record digests: 2 of 173 battles of 2026-10-27/28 differ (32cd92, rounds 3–4) with the same kills and leaks.
  - Lead: put the commit and the digest's JSON in records.
- Known flake: `test/studio/review.test.js` "trial uses the actual sandbox executor" once went over its 5 s limit on
  Windows.
- Open questions with no owner:
  - What would help new contributors (humans or Claude) get started?
  - Can a new server owner find how to fetch the assets and deploy from source?
  - Is a usability step missing before PRs go up?
