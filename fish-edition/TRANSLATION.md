Status keywords the official EN client does not have yet. Put the final English in `tools/i18n/fallback-remake.json`
(the empty `""` values at the end; keep the Chinese keys exactly as they are), then run `node tools/build-i18n.mjs`.
Related official EN keyword names, for consistency: 浮空 Levitate · 束缚 Bind · 庇护 Sanctuary · 停顿 Slow ·
近地悬浮 Low-Altitude Hovering · 起飞 Take Off · 元素损伤 Elemental Injury · 神经损伤 Nervous Impairment · 虚弱 Enfeeble.

# 缚地 (`ba.groundbind`)

- Official zh: 目标变为地面单位，无法移动；使部分近地悬浮敌人掉落；对重量大于3的单位持续时间减半
- MTL EN: **Groundbind** — "Target becomes a ground unit and cannot move; knocks down some Low-Altitude Hovering enemies; duration halved on units with Weight greater than 3"
- What does it do, according to the code? A flying enemy counts as a ground unit and can't move while it lasts (so ground-only Operators can block and hit it); duration halved above Weight 3; shortened by Status Resistance like other control statuses; a Levitate landing on a grounded flyer lifts it again. Hovering enemies that "drop" (Skimming Sea Drifter, Lucky Flyfin) do so through their own ability when hit by it. (server/sim/buffs.js, server/sim/battle/status.js)
- Example of where it appears? Angelina the Mellow Wish (Custom Squad) S2 「重力自定义」: as she glides forward, ground enemies in range are Levitated 10 s and **flying enemies Groundbound 20 s**.

Best guess according to https://arknights.wiki.gg/wiki/Angelina_the_Mellow_Wish : Grounded

# 对空庇护 (`ba.airprotect`)

- Official zh: 受到来自空中的物理和法术伤害降低相应比例（同名效果取最高）
- MTL EN: **Anti-Air Sanctuary** — "Reduces incoming Physical and Arts damage from aerial sources by the corresponding amount (only the strongest effect of this type applies)" (worded after the official EN Sanctuary text)
- What does it do, according to the code? Physical and Arts damage whose source is an aerial unit is multiplied by (1 − ratio); 55% on her S3. (server/sim/content/kits/ops/op-aglna2.js)
- Example of where it appears? Angelina the Mellow Wish (Custom Squad) S3 「酸橙的心事」: she Takes Off and gains **55% Anti-Air Sanctuary**.

Best guess according to https://arknights.wiki.gg/wiki/Sanctuary#Anti-Air_Sanctuary : Anti-Air Sanctuary

Wiki description: Reduces incoming Physical and Arts damage from aerial units by the corresponding amount (only the strongest effect of this type applies).

# 迟钝 (`ba.slowdown`)

- Official zh: 移动速度、攻击速度、部分技能施放速度和冷却速度、部分异常状态的恢复速度降低相应比例（同名效果取最高）
- MTL EN: **Sluggish** (or **Torpor**) — "Reduces Movement Speed, Attack Speed, the cast and cooldown speed of some skills, and the recovery speed of some negative statuses by the corresponding amount (only the strongest effect of this type applies)". Note: the official EN already uses "Slow" for 停顿 (−80% Movement Speed), so avoid "Slow" here.
- What does it do, according to the code? One effect per enemy at value v: Movement Speed ×(1 − v) and Attack Interval ×1/(1 − v); stacks from the same source add up and share one timer (capped), different sources take the highest. Its effect on enemy skill cooldowns and status recovery isn't modelled [ASSUMED]. (server/sim/content/kits/ops/op-closur.js)
- Example of where it appears? Closure (Custom Squad) S3 「Q.E.D.」: every hit applies **4% Sluggish for 3 s**, stacking up to 40%.

Note: Slow was historically referred to as Sluggish by advanced players, to differentiate this non-stacking -80% MSPD from other slowing effects

Best guess according to https://arknights.wiki.gg/wiki/Closure : Dull

# 部署费用下限 (`ba.costlowerbound`)

- Official zh: 部署费用可降低至部署费用下限；部署费用小于0时部署费用自然回复速度-50%
- MTL EN: **DP Lower Limit** (or **Minimum DP**) — "DP can be reduced down to the DP Lower Limit; while DP is below 0, natural DP regeneration is −50%"
- What does it do, according to the code? Nothing: DP never goes below 0 in this game and only automatic redeployment spends DP, so the talent's lower-limit part has no effect here [ASSUMED]; its ATK part works. (server/sim/content/kits/ops/op-closur.js)
- Example of where it appears? Closure (Custom Squad) talent 「极限调度」: while she is in your squad, the **DP Lower Limit is lowered by 4** and 【Rhodes Island】 Operators get ATK +4%.

Best guess according to https://arknights.wiki.gg/wiki/Closure : Minimum DP

# 狂躁损伤 (`ba.dt.rampage`)

- Official zh: 狂躁损伤累计至1000时，15秒内攻击速度+50，但每秒受到100点真实伤害（每次攻击时提升50，最多600）
- MTL EN: **Frenzy** (following the "Nervous Impairment" / "Corrosion" / "Burn" / "Necrosis" style) — "After Frenzy reaches 1000, the affected unit gains +50 Attack Speed for 15 s but takes 100 True damage per second (+50 per attack, up to 600)"
- What does it do, according to the code? Not implemented: nothing in the game applies it.
- Example of where it appears? No skill, item or enemy text uses it. Only the Chinese definition of 元素损伤 (Elemental Injury) lists it; the EN, JP, KR and TW definitions don't, so in English the popup can never reach it. Lowest priority; fine to leave empty.
