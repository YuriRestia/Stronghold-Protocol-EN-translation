# Phase 2 – Scoping

How feasible each idea in ROADMAP Appendix A is, based on reading the code at `en-translation` @ `091989f`, and a recommendation for the next PR. Effort ratings are relative: **S** ≈ a day or less, **M** ≈ a few days, **L** ≈ a week or more with design work.

## Status (2026-10-11)

This scoping was written against the old `en-translation` code. `main` has since been rebuilt on `yuri/dev-0.2` (which
includes sganggs/master 0.2.2), so read the sections below with these corrections.

**Done**
- **P1 Lobby rules + (a) +2 Deployment Limit, (b) +2 Funds, (d) untimed**: on main, shown as "Custom Lobby Modifications".
  The rules never needed to travel in the BattleSpec, because all three only act between battles; ideas that change
  combat (Alliance Modules, the rebalance) still must.
- **Difficulty details**: on main (#7) and merged upstream (Yuri #4).
- **Keyword popup**: on main (#8); `yuri/keyword-popup` pushed for upstream.

**Facts that changed**
- **Fact 1 is no longer true.** Upstream added matchmaking: solo matchmaking (`queue.join`, `server/soloQueue.js`) and
  "Find Teammates" for co-op rooms (`room.search`, `server/matchmaker.js`). A room with Custom Lobby Modifications on
  can be merged with strangers through Find Teammates. The "official rules only for matchmaking" question from the
  ROADMAP is real now.
- **Fact 3:** the host now sets three things before a match: the difficulty, "AI Teammates Pick Last"
  (`room.setAiPicksLast`) and the lobby rules (`room.setRules`).
- **Translations:** upstream replaced the old `T()` layer with `t()` (`shared/i18n.js`), UI packs in `public/i18n/` and
  game-text overlays in `data/i18n/<lang>.json` (`tools/build-i18n.mjs`). `tools/i18n/official-en.mjs` is gone.
- **Hard rule upstream (AGENTS.md):** never hand-edit `data/*.json`; change `tools/build-data.mjs` and regenerate. This
  is one more reason P2 overlays must live outside `data/*.json`.

**Moved paths** (upstream split the big files into modules)
- `PlayerState.deployCap` → `server/match/player/basics.js`; round income → `server/match/player/round.js`.
- `Match.soloUntimed` → `server/match/match/infra.js`; the result tally (`unitStats`) → `server/match/match/settle.js`.
- Unchanged: `server/sim/spec.js`, `server/match/pool.js`, `server/match/waves.js`, `public/js/render/units.js`,
  `public/js/screens/result.js`, `server/sim/content/bonds/core.js`.

**Still open from below:** status duration ring + status value, damage chart, P2 data overlays and everything behind
them, choosing bans / map, (c) doubled waves, and the questions in §5. New since: ROADMAP's "Reboot for updates".

## 0. Facts about the code that shape everything below

1. **There is no matchmaking.** `server/lobby.js` has only two room types. `solo` is one human. `coop` is up to 4 seats (humans plus AI bots) that players join with a 4-letter code. Every match is already a "solo or custom lobby". The rules about locking things for matchmaking or banning custom modules from it have nothing to apply to today. They become a single "official rules only" check if matchmaking is ever added.
2. **Combat runs in the browser.** The server sends a JSON `BattleSpec` (`server/sim/spec.js`). Each client simulates the battle with the same deterministic sim, served at `/sim/`. The server re-runs it to verify or take over.
   - **Consequence:** any rule that changes combat must travel inside the spec. Otherwise the client and server simulate different battles.
   - **Upside:** the client has the full `Battle` object, which helps the UI ideas.
3. **The host already controls one lobby setting, difficulty.** The flow is `room.setDifficulty` → `Room.difficulty` → `new Match({ difficulty, modeId })` → `GameData(data, modeId)`. A general "lobby rules" object would follow the same path.
4. **Game data is generated, global and frozen.**
   - `data/*.json` comes from `tools/build-data.mjs`, which rebuilds it from the official tables. `server/data.js` loads and deep-freezes it once.
   - There is **no override layer**. Hand edits to `chess.json` or `bonds.json` would be lost on the next rebuild, and they would apply to every match.
   - There is a precedent for per-battle data views: `withUnitLoadouts` in `server/sim/simdata.js` resolves skills and modules per unit.
5. **Alliance effects are hand-written per alliance:**
   - core alliances in `server/sim/content/bonds/core.js` (`INSTALLERS` map, e.g. `installLaterano`), add-ons in `bonds/addon/battle.js`;
   - between-round (prep) effects through `registerMeta`, e.g. the Victoria hammer payouts;
   - numbers come from each bond's `bb` in `bonds.json`.

   Swapping an alliance's behaviour therefore means swapping its installer and meta handler.
6. **Operator modules are data plus kit code.** `chess.json` `modules[]` holds `attr`, `traitOverride` and `talentChanges` from the official module tables. Kits in `server/sim/content/kits/tier*.js` read the resulting blackboards. A new module that only changes numbers is pure data. One that adds a mechanic also needs kit code.

**What follows from these facts:** most of the Gameplay Expansion ideas share two pieces of plumbing. **(P1) Lobby rules** is a host-set options object that goes room → Match → BattleSpec → clients. **(P2) Rule-set data overlays** are hand-maintained overlays applied to a per-match data view, chosen by the lobby rules. Neither exists yet. P1 is small. P2 is the main architectural decision.

## 1. Menu/UI ideas

| Idea | What exists | Work | Effort | Depends on |
|---|---|---|---|---|
| **Keyword popup on click** | `public/js/ui/richText.js` already parses term tags (`<$ba.stun>…</>`) into segments flagged `term`, rendered with class `rt-term` in `gameComponents.js`. The keyword's id (e.g. `ba.stun`) is kept in `cls`. The definitions are **not** in the repo: they live in the official `gamedata_const.json` `termDescriptionDict`, which `build-data.mjs` doesn't fetch, and `en.json` has no definition texts. | Fetch `termDescriptionDict` in build-data, from zh plus EN through the existing `tools/i18n/official-en.mjs` path. Emit a small `data/terms.json`. Add a click/tap popover on `rt-term` spans. | **S–M** | nothing |
| **Difficulty details** | The lobby shows only the official vague `effectDescList` ("·作战环境无比困难"). The real differences are all in `config.json` `modes[modeId]`. **Ultimate is not a flat modifier.** It is a per-round table, `enemyScale[r]`, with ATK/HP/speed multipliers. Examples, for R1 / R7 / R14: Hard HP ×1.2 / ×1.73 / ×4.30; Ultimate HP ×1.2 / ×3.58 / ×6.69, ATK up to ×2.14, speed ×1.15 from R7 on. Difficulty also changes the alliance bans (FUNNY 0+1, others 3+4), the map pool, leader HP (`bloodPoint*`), the active alliances and enemies, the special rounds, and the Hidden Core round. | Client-only. A "details" toggle or help popover under the difficulty picker that derives a summary from `modes[modeId]`: an HP/ATK multiplier line for R1, R7 and R14, plus bans, map count, hidden round and special rounds. No server change. | **S** | nothing |
| **Status duration ring** | Status icons are drawn per unit in `public/js/render/units.js`. The sim's `['status', unitId, key, on]` events carry only on/off. The sim's buffs carry `duration` and `timeLeft` (`server/sim/buffs.js`). | Either add the duration to the status event, or let the renderer read the local `Battle`, since the browser already runs it (fact 2). Then draw an arc on the existing round icon (`hudRings` / `ringArc` helpers already exist in `render/textures.js`). Display replicas and catch-up frames must stay right, so extending the event, e.g. `[…, on, duration, value]`, is the safer option. | **M** | nothing; pair with the next row |
| **Status value (e.g. Fragile 35% vs 40%)** | **Confirmed.** Fragile carries a value (`fragile: { mods: (v) => ({ dmgTakenMul: 1 + v }), valued: 0.3 }`), but the icon shows only the key. | Same event extension, plus a small number label on valued statuses. | **S** on top of the previous row | the ring PR |
| **Damage chart** | Every battle result already carries per-unit stats: `compactResult` → `perPlayer[pid].unitStats[] = { uid, defId, dmg, kills, heal }`. The server uses them for broadcast tickers and then drops them. | The server keeps a per-round tally `{ round, playerId, charId, dmg }` and grouping by `charId` merges duplicates and normal/elite copies, as asked. It is sent with `m.result`. The result screen (`public/js/screens/result.js`) gets an "Analysis" tab. **Prototype:** bars per operator. **Full version:** the operator/player/round grouping toggles and the last-round / second-last-round filters. No chart library is needed: plain HTML/CSS bars or SVG. | **M** (prototype S–M) | nothing |

## 2. Gameplay Expansion ideas

### Plumbing

| Piece | Work | Effort |
|---|---|---|
| **P1 Lobby rules** | Add a `room.setRules { … }` host message, validated in `shared/protocol.js` the way `room.setDifficulty` is. Store it on `Room`, show it in `room.state`, pass it to `new Match({ rules })`, copy it into each `BattleSpec` (`rules` field), and show it in `m.public`. It needs a room-screen panel (`public/js/screens/room.js`). As with difficulty, changing the rules un-readies the other players. | **M** |
| **P2 Rule-set data overlays** | Add hand-maintained overlay files (e.g. `data/overlays/<ruleset>.json`). `build-data` must never overwrite them. They are merged into a per-match `GameData` view and a per-battle sim data view, chosen by `rules`. Clients build the same view from the same files, which the server serves. They need a test that the overlays still match the generated data after a `build-data` rebuild. | **M–L** (the main design decision) |

### Ideas

| Idea | Findings | Effort | Hard deps |
|---|---|---|---|
| **(a) +2 Deployment Limit** | `PlayerState.deployCap = gd.deployCap + deployCapBonus` (`server/match/PlayerState.js:176`). Set the bonus from the rules. The board has room (rows 9–12 × cols 2–10). | **S** | P1 |
| **(b) +2 Funds every round** | Income goes through `gd.income(round)` and the `onIncome` event in `PlayerState.js:1459`. Add 2 there. | **S** | P1 |
| **(c) Doubled enemy waves** | Spawns are built per round in `server/match/waves.js` (`buildNormalWave`, which is the decoded official generator). "Copy the list once" is easy to do. **Interactions that need your decision:** the per-round time limit (`combatTimeLimit`, 45–115 s), the per-round LP loss cap (`lpCapPerRound` = 10), "perfect round" counting, the wave preview, and whether the copy spawns with the original or after it. Also: do leader rounds and Joint Defense (联防) double too? | **S–M** | P1 |
| **(d) No time limit on action screens** | Already built for solo: `Match.soloUntimed` (`isSolo || loneHuman`) makes the alliance draft, special draft and prep untimed. Prep ends when every alive player is Ready. The modifier is `soloUntimed ‖ rules.untimed`. The INFO_CHECK guard and the presentation steps must keep working. | **S** | P1 |
| **(e) Rebalanced alliance effects** | See "Rebalanced Alliance Effects" below. | **L** | P1, P2 |
| **Choose alliance bans and map** | Bans are drawn in `server/match/pool.js` `drawDisabledBonds` (count per difficulty from `gd.bans`). The map is picked in `waves.js` `setupMatchWaves`, weighted from `mode.stages`. Both take a seeded rng, so a host choice just replaces the draw. Needs a picker UI in the room panel. | **S–M** | P1 |
| **Difficulty above Ultimate** | A new mode is mostly data: new `modes.mode_{single,multi}_<id>` entries (enemyScale table, bans, stages, boss weights, `bossHpScale.bloodPointKey`), plus `DIFFICULTIES`, `DIFFICULTY_NAMES` and `DIFFICULTY_COLORS` in `shared/constants.js`. Also `bosses.json` needs leader HP for the key, results and reward rows (`results.js`), the Hidden Core eligibility list, a picker icon (there is no official art, so a reused or tinted one), and the bot. It doesn't strictly need P1, because it is just a fifth difficulty, but its data must survive `build-data`, so it wants P2 or a build-data step that adds it. Balance numbers need your input. | **M** | P2 (or a build-data patch) |
| **Alliance Modules** | Per alliance, a module id picks which installer and meta handler run (fact 5). The bond's `bb` and its description must come from the module, which means a data overlay for the text and numbers (P2) plus new code for new mechanics. It must also be in the BattleSpec (fact 2). Bots value alliances from data, so they need to keep working with module text and numbers. The host picks one module per alliance for all players. As noted, nothing exists to lock it for matchmaking. | **M** for the framework, then per module: **Laterano Mod B M**, **Victoria Mod C M–L** (several new hooks: cost-0 upgraded hammers in the shop, end-of-Rest-Phase stacks, cross-alliance stack grants, barrier and status resistance) | P1, P2 |
| **Custom Operator Modules** | Records go into `modules[]` (fact 6), through an overlay, so `build-data` doesn't drop them. Pure stat or trait-number modules are data only. Mechanic changes need kit code. The loadout UI (`public/js/screens/loadout.js`) and `checkLoadout` would accept them only when the rules allow, and fall back to the default module otherwise (the graceful fallback you asked for). They need art: a module type icon. | **M** per non-trivial module, plus **S–M** once for the overlay and fallback | P1, P2 |

### Rebalanced Alliance Effects (each item)

| Item | Findings | Effort |
|---|---|---|
| **Virtuosa (塑心, `chess_char_6_09_a/_b`) also in Swift (`swiftShip`) and Aid (`deputShip`)** | Membership is `chess.bonds[]`, which drives the pool, the bans, member counts, the UI strips and bots. Pure data (overlay). | **S** once P2 exists |
| **New "Radiant" alliance (True damage)** | Needs a new bond record (layers, thresholds, weight, icon, i18n), an installer (the damage pipeline in `server/sim/damage.js` already separates damage types, so "+X% True damage taken" is a small hook), membership on 5 chess (魔王 4_25, 玛恩纳 5_19, 耀骑士临光 6_17, 维娜·维多利亚 6_07, 荒芜拉普兰德 6_18), and addition to every mode's `activeBondIds`. It also touches the bans, bot valuation, the alliance UI and the alliance art (a new icon). The design is still open ("??? · activates at 2"). | **M–L** |
| **Catherine → Blaze** | **Blaze (煌) is not a chess this season.** Only Blaze the Igniting Spark (烛煌, `char_1040_blaze2`, 5_03, already Victoria + Yan) exists. A new Blaze chess needs a record built from the official `character_table` / `skill_table`, a hand-written kit (Catherine's skills moved over, per the idea), a sell hook that spawns 烛煌, art from the downloadable asset set, and an alias for loadouts and saved data that point at Catherine. | **L** |

## 3. Dependency graph

```
UI (independent, parallel-safe):
  Keyword popup · Difficulty details · Status ring ─▶ Status value · Damage chart

P1 Lobby rules ─┬─▶ (a) +2 Deploy, (b) +2 Funds, (d) Untimed     [prototype consumers]
                ├─▶ (c) Doubled waves                            [needs your answers]
                ├─▶ Choose bans / map
                └─▶ P2 Data overlays ─┬─▶ Alliance Modules ─▶ Laterano B, Victoria C
                                      ├─▶ (e) Rebalance ─▶ Virtuosa, Radiant, Blaze
                                      ├─▶ Custom Operator Modules
                                      └─▶ Difficulty above Ultimate
```

**Soft dependencies:**
- (a), (b) and (d) are the cheapest way to prove the whole P1 path: UI → protocol → Match → BattleSpec → client.
- The Virtuosa membership change is the smallest P2 consumer, and a good overlay prototype before Alliance Modules.
- The status ring and status value share one event change, so do them in one PR or back to back.

## 4. Recommendation

**Next PR: P1 Lobby rules + modifiers (a) +2 Deployment Limit, (b) +2 Funds, (d) no action time limit.** All default off and set by the host in the room screen.
- It is a hard dependency of every Gameplay Expansion idea, including the Alliance Modules you have already designed.
- The three modifiers are each a few lines on top of it, and they test the whole room → match → client path without touching balance data.
- It doesn't need P2, so it is a contained change.

**In parallel (independent files, no conflict with P1):**
- **Keyword popup:** build-data plus a popover. A small quick win, and it fixes something you see every game.
- **Difficulty details:** client-only, using numbers that are already in `config.json`.

**After that, in order:**
1. P2 data overlays, proven by the Virtuosa membership change.
2. Alliance Modules framework + Laterano Mod B.
3. Choose bans/map and (c) doubled waves, once the wave questions below are answered.
4. The status ring and value pair, and the damage chart, can go in parallel with any of these.

## 5. Questions for the dev before the expansion work

1. **Doubled waves:** does the copy spawn alongside the original or after it? Does the time limit grow? Does the per-round LP cap stay at 10? Do leader rounds and Joint Defense double?
2. **Difficulty above Ultimate:** the per-round ATK/HP/speed table (or "Ultimate × k"), the leader HP, the bans, the rewards, and whether Hidden Core is included.
3. **Laterano Mod B:** "trigger twice" for on-spend effects, per bullet or per effect instance? Is the 6-member +4%/ammo the same as Mod A's?
4. **Victoria Mod C:** do Victorian Hammers in the shop "cost 0 and are upgraded" only for the module owner, or for everyone in the lobby? Does "200% HP as Barrier" mean 200% of max HP? Is the 6-member stack grant per Rest Phase?
5. **Radiant:** the thresholds, the stack sources, and the icon.
6. **Blaze:** which season-1 data and kit should she use (stats and skills at which tier)?
