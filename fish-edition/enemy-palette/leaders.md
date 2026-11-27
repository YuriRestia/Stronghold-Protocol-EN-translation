# Leader enemies in this mode

Every enemy here already has a kit in the sim.

## Final Assault / Hidden Core bosses

- 'Samivilinn,' the Resolution of the Very North (“萨米的意志”)
- Alistair, Final Flame of the Empire (阿利斯泰尔，帝国余晖)
- Lucian, 'Blood Diamond' (卢西恩，“猩红血钻”)
- OpFor: Armor (假想敌：胄)
- OpFor: Gun (假想敌：铳)
- OpFor: Pipe (假想敌：管)
- Sal Viento Bishop Quintus (盐风主教昆图斯)

## Leaders

- 'Demon's Blade' (“邪魔的利刃”)
- 'Forsaken One' (“遗弃者”)
- 'Free' (“自在”)
- 'Gravestone' (“墓碑”)
- 'Hateful Avenger' (“复仇者”)
- 'Pompeii' (“庞贝”)
- 'Rat King' (鼠王)
- 'The Big Ugly Thing' (“巨大的丑东西”)
- Arc Frontliner (弧光锋卫)
- Blackhorn Rhuul (乌顶巨角卢鲁)
- Careless Underling (冒失的小弟)
- Corrupted Knight (腐败骑士)
- Crownslayer (弑君者)
- Decode Basis α (转译基底·α)
- Degenbrecher (锏)
- Fallen Snowpriest (陷落雪祀)
- Fatty (圆仔)
- Frostcradler Fowlbeast (拥霜羽兽)
- Jesselton Williams (杰斯顿·威廉姆斯)
- Jetman (喷气人)
- Lost Colossus (迷路的巨像)
- Mudrock (泥岩)
- Skullshatterer (碎骨)
- Snowchild (雪孩子)
- W (W)
- Weaving Vinecreeps (纠缠藤蔓)
- Withered Knight (凋零骑士)
- Zaaro, Signore dei Lupi (扎罗，“狼之主”)

# Newly prototyped

## Patriot

Prototype feedback:

- The animation and sound effects for the revive seems to be missing.
- His health bar should refill over the revive duration, to communicate how close he is to finishing.
- Spear throwing skill is missing any kind of visual cue, sound effect, or hit vfx. It wasn't obvious to me that he was doing it at all, other than I noticed some back line operators had surprisingly low HP.
- On Perilous (all cheats) vs a Siracusa build, he wasn't that threatening, but he didn't die instantly either. Probably difficulty is already fine for risk 1.

# Clarifications

## Notes on Degenbrecher and Zaaro (2026-10-15)

Both have their second form and their revive in the sim (`server/sim/content/enemies/leaders.js`; the revive is the
shared `reborn()` of `enemies/archetypes.js`): the first knock-out is hidden, the enemy stays put invulnerable and
untargetable while its HP refills, then it stands up in its second form and is invincible for a while. The numbers come
from the official data.

**Zaaro, Signore dei Lupi** (`enemy_1535_wlfmster`)

- Revive: **40 s** (`Reborn.duration` 40), with Primal Deterrence slowing the units around him meanwhile; then 10 s
  invincible (`Passive2.invincible_time`). So yes, 40 s as in the original.
- First form: −30 % damage taken, can't be stunned, Hemolytic Horror (3 operators: ASPD −70, can't retreat, a bleed
  that ramps over 40 s, cured once he loses 20 % HP).
- Second form: ranged double hits, more ATK, longer Hemolytic Horror, Primal Deterrence still on.
- Not modelled: **Blood Debt** and **Furious Howl** (both feed the event's Blood Debt gauge, which this mode lacks).

**Degenbrecher** (`enemy_1525_blkswb`)

- Revive: **5 s** (`Reborn.duration` 5), then 10 s invincible (`Reborn.invincible` 10).
- First form: Status Resistance, DEF penetration against his blocker, Quickslay (blinks through his blocker, hitting
  everyone on the way), Raging Blizzard (AoE).
- Second form: stealth, more DEF penetration (40 %), double hits, and at every 25 % HP lost a burst that clears the SP
  of the operators around him and disarms them.
- ~~Gap~~ (corrected 2026-10-16): the ATK +30 % / +50 % in the data (`AtkUp.enemy_blkswb_t_1`, `[reborn]` 0.5) is her
  Snowfall buff — the game's text: "Gains increased ATK during <Snowfall>". Snowfall isn't modelled in this mode, so
  the kit rightly leaves it off. Not a gap.
- Not modelled: **Snowfall** (降雪, an event stage mechanic).

**How strong they get.** Leaders in regular rounds scale with the round's enemy multipliers, not the final boss's pool:
on Ultimate, round 13, co-op ×6.69 HP and ×1.95 ATK (Zaaro ≈ 234,000 HP, Degenbrecher ≈ 187,000), solo ×2.99 HP and
×1.77 ATK. The final bosses fight from a pool of millions (3–4.2 M on Ultimate). So against a late-game SPA board both
would fall fast unless a tag scales them up — the same lever as `ccBoss`, applied to a chosen leader.
