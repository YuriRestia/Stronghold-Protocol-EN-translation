# Plugin DSL (P2)

> English translation of [PLUGIN-DSL.md](PLUGIN-DSL.md). The Chinese original is the authoritative version. Game terms follow the official EN client (as used by the in-game English UI, `public/i18n/en.json`).

For plugin authors. This only describes data; no plugin code is executed. The compiler is `compileDsl(spec, { bb, chess, def })` in `server/sim/content/dsl/compile.js`, and what it returns is the same Kit that an official kit function returns. Preparation effects go through `server/match/dslMeta.js`. A machine-readable copy of the vocabulary is `schemas/dsl.schema.json`. The design record is DESIGN §32.7.

Vanilla matches do not read these files. A data plugin puts the battle spec on the operator record's `dsl`, and `kitOf` compiles it with the same `compileDsl`; the preparation spec sits in the manifest's `dsl` part and is registered by the match host. See section 9. Tests can still pass the compiled result into `makeBattle({ kits })`.

## 1. What a spec looks like

```json
{ "dsl": 1,
  "pluginId": "my-plugin",
  "budget": 8000,
  "skill": { "kind": "duration", "mods": { "atkPct": { "bb": "atk" } } },
  "talents": [ { "when": "battleStart", "do": [ { "dp": { "amount": 1, "fx": false } } ] } ],
  "meta": { "key": "effect:my-plugin:income", "on": [ { "when": "income", "if": { "round": 3 }, "do": [ { "funds": { "amount": 15, "setIncome": true } } ] } ] } }
```

- `dsl` can only be `1`.
- `pluginId` is 1–64 letters, digits, underscores or hyphens. Compilation requires the host to supply this id (`opts.pluginId`, or an id written by the content set on `def.raw.pluginId` that matches the former). A `pluginId` the author writes in the spec cannot override the host. If the two disagree, if two trusted sources disagree with each other, or if the host gives no id, it is `PLUGIN_DSL_PLUGIN_ID`. There is no "if omitted, count the budget under `dsl`": that would squeeze every spec without an id into the same slot, and on truncation they would strip each other's buffs.
- [ASSUMED] Expression nesting and node count are each capped at 64. Beyond that is `PLUGIN_DSL_LOOP` (more than 64 levels) or `PLUGIN_DSL_VALUE` (more than 64 nodes); the validator returns an error instead of blowing the call stack. `schemas/dsl.schema.json` does not count this depth, nor the 4 levels of `then`. A studio that trusts only the schema may still let it through; `compileDsl` / `validateDsl` will reject it.
- [ASSUMED] The content set already rejects bad specs at build time. If compilation still throws (the code is `PLUGIN_DSL_*`, or the record carries `dsl`, including `PLUGIN_DATA_BOUND`), the battle ends immediately as `forced`: log tag `content:dsl`, `result.errors > 0`. It is not swapped for an empty kit or a generic kit, and the operators do not go on to fight. The player sees the usual battle-end box, with no DSL-specific text. This is not the room's `plugin-start`. Other exceptions unrelated to the DSL still go to the usual generic kit.
- `budget` may be omitted. [ASSUMED] When omitted, it is 8000 actions per battle, per plugin. If written, it must be an integer from 1 to 10000000.
- `skill` is the currently selected default skill. `skills` gives other skills keyed by skill id. Duration, SP cost and initial SP fall back to the operator data when omitted; omitted ammo is treated as 0 by the engine, so ammo skills must write `ammo`. Don't omit `kind`: the engine would treat the skill as instant.
- Skill callbacks go in `on`: `start` / `end` / `hit` / `attack` / `tick`. `on.start` runs before the engine emits `skillStart`; don't also write a `skillStart` talent to do the same thing.

`loop`, `while`, `for`, `code`, `js`, `eval`, `external`, `script` and `import` are not accepted. There are no loops, and no state outside the battle.

## 2. Triggers

`always`, `deploy`, `battleStart`, `attack`, `hitDealt`, `hitTaken`, `kill`, `allyDeath`, `skillStart`, `skillEnd`, `every`, `hpBelow`.

[ASSUMED] How they map:

| Trigger | Engine hook |
|---|---|
| `always` | Runs once at install for a unit already on the field. If the unit is not alive yet at construction, it moves to that unit's first `deploy` instead, once only; redeploying does not run it again |
| `deploy` | `deploy`, and it is this very unit |
| `battleStart` | `battleStart` |
| `attack` | `attack`, the attacker is this unit, the first target is taken |
| `hitDealt` | `hit`, the source is this unit; damage tagged `dsl` no longer enters |
| `hitTaken` | `damaged`, the target is this unit, and it is an attack by the enemy side (HP loss, elemental, sourceless, counter and reflect don't count); damage tagged `dsl` doesn't enter either |
| `kill` | `kill`, the killer is this unit |
| `allyDeath` | Another ally dies, and it belongs to the same owner |
| `skillStart` / `skillEnd` | The hook of the same name, the unit is this unit |
| `every` | `battle.every`. `seconds` cannot be less than 1/30. The first time is after one interval |
| `hpBelow` | The moment `hpRatio` drops below `below`; it does not fire again until it is back above the line |

`cooldown` is in seconds and is kept on this install; redeploying (`deploySeq` changes) clears it. Two identical operators don't share a cooldown. When the unit is already down, actions don't run except for `battleStart`, `allyDeath` and `deploy`. `always` doesn't run while the unit is not alive yet (see the table above).

The actions run only when all conditions hold. `chance` uses this battle's `battle.rng` and is drawn last: if an earlier condition fails, no random number is consumed. A failed roll doesn't cost action budget.

## 3. Conditions, targets, values

Conditions: `chance`, `targetHas` (a status or a buff of that name), `selfHpBelow`, `enemiesInRange` (the number of enemies currently in range ≥ n), `bondActive` (`{ "id", "tier" }`: the Alliance's Stacks reach `tier` and the Alliance is active), `skillActive` (`true` means the skill is on; a string means the skill id is exactly that).

Targets: `self`, `target`, `source`, `alliesInRange`, `enemiesInRange`, `enemiesInRadius`, `lowestHpAlly`, `allAllies`.
[ASSUMED] When `enemiesInRadius` is written as `{ "enemiesInRadius": 1.5 }`, the center is the operator, and it uses the skill's targetable radius (it can't pick untargetable enemies, nor unrevealed Camouflaged ones). You can also write `at` (`self` / `target` / `source` / `lastSpawn`), `shape` (`radius` or `chebyshev`) and `includeStealth`. Omitting `at` means the operator. `lastSpawn` picks nobody while there is no summon yet; it does not fall back to the operator's tile. When `shape` is `chebyshev` or `includeStealth` is true, it scans in the order of the enemies on the field: dead, hidden and untargetable ones are skipped; Camouflaged ones are skipped by default and only hit with `includeStealth: true`. Chebyshev uses `cheb`; a distance less than or equal to the radius counts as a hit. Kazemaru's origami is Chebyshev 1 around the Substitute Doll (the 8 surrounding tiles), and Camouflaged enemies take the damage too; the effect's `radius` can still be written as 1.5, which is the visual, not the hit test. `lowestHpAlly` only includes allies in range that are already injured. `allAllies` only includes allies of the same owner; on a Unite battlefield it can't reach another player's operators. When the target is omitted, the action lands on the unit itself.

A value object has exactly one operation. `{ "bb": "atk", "mul": [2, 3] }` is `PLUGIN_DSL_VALUE`, with the Chinese note「取值对象恰好一个运算」("a value object has exactly one operation"). At run time it does not quietly read only `bb`.

Values only do the four basic arithmetic operations:

- Numbers.
- `{ "bb": "atk" }` reads this skill's blackboard. It may carry `default`.
- `{ "talent": [0, "cost"] }`, the blackboard of the 0th named talent (entries with index −1 are skipped).
- `{ "mul": [ ... ] }`, `{ "add": [ ... ] }`, `{ "min": [ ... ] }`, `{ "max": [ ... ] }`.
- [ASSUMED] `{ "sub": [ ... ] }` and `{ "div": [ ... ] }` mean subtract and divide. A literal division by 0 is rejected at validation. A division by 0 at run time gives 0, not infinity.
- [ASSUMED] `{ "trait": "atk" }` reads the trait blackboard. `{ "stat": "atk", "of": "self" }` reads the unit's current stat at the moment of the action; `of` can be `self`, `target`, `source` or `lastSpawn`. `{ "batMod": { "bb": "base_attack_time" } }` goes through the engine's attack-interval conversion, carrying the skill description along, because the raw `base_attack_time` is in seconds, not a percentage.

Non-finite numbers are treated as 0. An empty `min` / `max` is 0.

## 4. Actions

Every action goes through an existing engine helper; no new damage pipeline is opened.

| Action | Helper | Notes |
|---|---|---|
| `buff` | `addBuff` | Tagged `plugin:<id>`. Without a duration it is the engine's default (permanent) |
| `status` | `applyStatus` | `key`, `duration`, optional `value` |
| `damage` | `dealDamage` | Automatically tagged `dsl`, so it does not trigger this plugin's `hitDealt` again. `isSkill`, `canDodge` and `isAttack` are passed only if written. Don't assume it is a normal attack by default |
| `heal` | `heal` | |
| `sp` | Gives SP | The reason is talent recovery |
| `dp` | `addDp` | [ASSUMED] With `fx: true` the `dp` effect plays even when the cost is 0 |
| `push` / `pull` | `push` / `pull` | |
| `spawnToken` | `spawnToken` | See below |
| `layers` | `addLayers` | `bond` is the Alliance id |
| `shield` | the shield of `addBuff` | [ASSUMED] Visible by default; hidden only with `visible: false` |
| `fx` | `fx` | `kind`, optional `at` (`self` / `target` / `source` / `lastSpawn`), `radius`, `skill`, `token`, `n`, `dur`. With `id: false` the unit id is not written |

[ASSUMED] `damage.lose: true` switches to HP loss (`loseHp`). `minRemain` means that if HP would end up below this number after the loss, the loss does not happen this time. When `damage.from` is `"lastSpawn"`, the damage source is the unit just summoned.

[ASSUMED] `then` can be written beside the action or inside that action's parameters (Texas's "hit twice, then stun" uses the in-parameter form). Writing both is reported by validation as `PLUGIN_DSL_ACTION`. For damage, status, buff, heal, SP, push, pull and shield, it runs after each target is resolved and before the next target. For other actions it runs once after the whole action is done. `then` nests at most 4 levels. `times` repeats this one damage node 1 to 8 times, stopping when the target goes down; it is not loop syntax.

[ASSUMED] The `tile` of `spawnToken` is `"around"` (a standable empty tile around) or absolute coordinates `{ "r", "c" }`; there are no relative offsets. Absolute coordinates must be inside the battlefield rectangle, not a reserved tile, and standable (`canStand`). Tiles where you can't deploy, such as the start and the end, are rejected. On failure, as with `"around"`, the remaining actions stop only with `stop: true`. Coordinates are not cut again by the owner's half of the field: [ASSUMED] standable path tiles on the other half during Unite can still be summoned on. `token` can be a string, or `{ "override": true, "match": ["shadow", "doll"], "fallback": "…" }`: first the operator's `overrideTokenKey`, then a substring match against its own token list. `mem` records the summon in the unit's memory. `fx: true` plays `summon`.

The skill's `mods`, `ammo` and attack multipliers are computed into numbers when the Kit is compiled, because the engine stores numbers on the skill spec. `{ "stat" }` in action lists is still computed when triggered.

## 5. Budget and reentrancy

Counted in executions, not time, so every machine gets the same result. One action node counts as 1, however many units it hits. Once exceeded, only this plugin's effects in this battle stop: its timers are cancelled, the buffs it tagged `plugin:<id>` are removed, and skill buffs already attached by the engine stay until the skill ends. A `plugin:<id>` error is logged (`battle._handlerError`, which the match copies into `m.simErrorLog`). The action that went over is not executed. Other plugins continue.

Damage it deals itself carries `dsl` and by default no longer enters its own `hitDealt` / `hitTaken`, so a trigger chain can't hit itself into a loop. This is the DSL side of the engine's reentrancy rule. The `dmg` tuples of the compact event stream don't carry this tag; the damage info itself does. Compared with the official run, the tags have one extra `dsl`.

[ASSUMED] Truncation removes buffs tagged `plugin:<id>` and cancels this plugin's timers. Statuses added by `applyStatus` and summons that have already landed don't carry this tag and are not taken back. The budget table is a WeakMap on the battle object and is not in snapshots. This branch does not resume from mid-battle snapshots; if it ever does, the count restarts from 0. A shared battlefield (Unite / boss) has one count per battle.

## 6. Preparation

Each entry of `meta.on`: `when` is one of `roundStart`, `income`, `buy`, `sell`, `refresh`, `merge`, `levelUp`, `battleResult`, and `do` holds `funds`, `layers`, `gainItem`. If `meta.key` is written, it must be `effect:<plugin id>:<local name>`, for example `effect:my-plugin:income`. `band:`, `global:` and other prefixes are not plugin keys. The schema only checks this shape and does not check that the id in the middle is the host's. `registerDslMeta(registry, spec, opts)` checks it against the host id; on a mismatch it is `PLUGIN_DSL_META` and `register` is not called, so it cannot overwrite an official handler already registered.

`funds` calls `addFunds` by default. [ASSUMED] `setIncome: true` instead writes this income event's `ev.income` directly (truncated to an integer, minimum 0), and leaves the original number alone when the condition fails. This is how to write "the income of a given round equals some number", including 0. `layers` calls `addLayers`, `gainItem` calls `grantItem`.

[ASSUMED] The preparation side has no count-based action budget. Conditions can use `round` (an integer, equal to `ctx.round`), `chance` and `bondActive`. `bondActive` reads the preparation ctx: `ctx.bond(id)` first, otherwise `ctx.bonds[id]`; `active` uses the field on the record, and only when the record lacks that field does it look at `ctx.bondActive(id)`; `tier` uses the Stacks on the record. Conditions that need a unit (`selfHpBelow`, `enemiesInRange`, `skillActive`, `targetHas`) are `PLUGIN_DSL_CONDITION` at validation, with a note saying「备战条件不能用这一条」("not allowed as a preparation condition"); they are not silently treated as false.

Register by calling `registerDslMeta(registry, spec, opts)`. It is not written into the default registry at load time. Lee's income comparison uses the return value of `compileDslMeta` directly and does not register on `band:band_lmlee`.
## 7. Specs aligned with the official effects

In the tests these specs fight the same battle as the official kit, and the event streams match. The official kits themselves were not changed.

Duration: Earthspirit, ATK up. No `duration` is written, so the data's 25 seconds is used.

```json
{ "dsl": 1, "pluginId": "rewrite-skgoat", "skill": { "kind": "duration", "mods": { "atkPct": { "bb": "atk" } } } }
```

Ammo: Insider's default skill. Ammo must be written out. The attack interval uses `batMod`. The comparison window is shorter than 20 seconds, so the "more ammo after being deployed for a while" talent is not written.

```json
{ "dsl": 1, "pluginId": "rewrite-inside",
  "skill": { "kind": "ammo", "ammo": { "bb": "attack@trigger_time" },
    "mods": { "atkPct": { "bb": "atk" }, "batPct": { "batMod": { "bb": "base_attack_time" } }, "taunt": -1 },
    "targeting": { "priority": "ranged" } } }
```

Talent trigger: Texas. Sword Rain first adds DP and plays the effect, then deals Arts damage twice to every enemy in the skill range, then stuns. The battle-start talent adds 1 DP without playing the effect. The skill range uses `targeting.rangeGrid: "skill"` with `noRangeExtend: true`, so `enemiesInRange` uses the skill's tiles with an extension of 0, the same result as the official kit passing the tiles into the helper.

Summon: Kazemaru. Loses half of the current HP (no loss when less than 1 would remain), summons the Substitute Doll around her, and plays the summon and origami effects. The origami damage is centered on the Substitute Doll, its shape is Chebyshev distance ≤ 1, Camouflaged enemies are hit too, and it is not `foesInRadius` at the operator's feet. Taking the Substitute Doll back when the skill ends still has no matching action; the comparison stays within 20 seconds. Placing the enemies far away where neither side hits them cannot be counted as the origami damage matching bit for bit. The tile that does get hit within the window (the far side of the Substitute Doll, plus one Camouflaged enemy) is what this comparison checks. Over the full skill duration, the official Substitute Doll is taken back by `onEnd`, while the DSL's Substitute Doll is still there.

Preparation: Lee. Income in rounds 1 and 2 is written as 0 and in round 3 as 15, with `setIncome: true`. This is not a battle event stream but the result of `ev.income` in the preparation dispatch.

## 8. Error codes

The validator returns `{ ok, problems: [{ code, path, zh }] }` and does not throw. Only compilation throws, with these codes in the message. The codes are in the catalogue of `shared/plugins/errors.js` (`node tools/plugin.mjs errors`).

`PLUGIN_DSL_SHAPE`, `PLUGIN_DSL_VERSION`, `PLUGIN_DSL_PLUGIN_ID`, `PLUGIN_DSL_BUDGET`, `PLUGIN_DSL_LOOP`, `PLUGIN_DSL_TRIGGER`, `PLUGIN_DSL_CONDITION`, `PLUGIN_DSL_ACTION`, `PLUGIN_DSL_TARGET`, `PLUGIN_DSL_EVERY`, `PLUGIN_DSL_NUMBER`, `PLUGIN_DSL_DIV0`, `PLUGIN_DSL_VALUE`, `PLUGIN_DSL_SKILL`, `PLUGIN_DSL_META`, `PLUGIN_DSL_TALENT`.

The notes are Chinese text for authors, not in-match UI text.

## 9. Putting it in a data plugin

The battle spec goes in the compact operator's `kit`: `{ "dsl": { "dsl": 1, "skill": { … } } }`. Preparation specs go in the manifest part `"dsl": ["dsl/income.json", …]`, one spec with `meta` per file. The permission is `"dsl"` (operator records also need `"data.add"`).

When the content set is built, `validateDsl` checks them. A bad spec rejects the whole set, with a `PLUGIN_DSL_*` code. Once it passes, the battle spec is written into the piece record's `dsl` (`def.raw.dsl`). The builder writes `pluginId` separately and does not change the `pluginId` the author wrote in the spec. If the author wrote one, it must match the host plugin, otherwise `PLUGIN_DSL_PLUGIN_ID`. Omitting `pluginId` in the spec is allowed [ASSUMED].

Preparation files must carry `meta` [ASSUMED]. They go into the content set's `data.dsl[<plugin id>]`, and therefore into `cs`. Vanilla sets don't have this table. The match host calls `registerDslMeta` for each spec after `setData` and before importing Match. The key must be `effect:<this plugin's id>:<local name>`.

[ASSUMED] The preparation specs in a content set apply to every player of that set: after Match has constructed the players, the host attaches a `{ key, battle: false }` EffectRef to each of them. Authors cannot register `global:`. If it is only registered and this reference isn't attached, the income hook won't run.

[ASSUMED] The build already rejects bad specs. When compilation still throws, the battle records `contentFault` (`content:dsl`) in `setupUnitKit` and ends as `forced`, with no deployment and no swap to an empty or generic kit. The player sees the usual battle-end box. A preparation spec that bypassed the builder but whose hash still matches fails at the host's `boot` (`boot-error` / the room's `plugin-start`, `PLUGIN_DSL_META`). `plugin check` only checks the shape; it checks neither the plugin id in the key nor the numeric caps; `buildContentSet` rejects those two. A direct literal over the official cap is `PLUGIN_DATA_BOUND` (`max(10 × vanilla maximum, 64)`). The factors inside `{mul}` are not rejected one by one; the result is clamped to the same cap. `duration`, action values and `rangeExtend` are not in this table. `potDown` cannot write `dsl` / `pluginId`. Other plugins cannot change this record's DSL. `data.dsl` is a reserved table; data pack patches cannot write it.

`plugins/_template/content/` has a DSL operator (passive ATK +50%) and a preparation file that sets round 1 income to 15. `node tools/plugin.mjs new dsl <id>` generates the same example, and `check --strict` passes. When copying the template directory to `plugins/data-demo/`, the folder name must match the id in the manifest.
