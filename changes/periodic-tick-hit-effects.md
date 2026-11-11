## 2026-11-11

### Damage-over-time and heal ticks show their official hit effects

Many skills hit or heal again and again over time: a poison cloud, a heal rain, a pulse every second. The official game plays an effect, and often a sound, on each unit at every tick. The battle never told the screen about those ticks, so 18 such effects never showed. Now each tick sends a display-only signal, and the screen plays the official effect on the right unit, even after the skill has ended (Lumen's S1 heals keep going after the cast). Nothing in combat changes.

| Operator | Skill | What now shows at each tick |
|---|---|---|
| Tin Man | S1, S2 | The hit on every enemy in the alchemy unit's area, with its sound |
| Lumen | S1 | The heal splash on each ally the rain heals |
| Necrass | S2 | The hit on each linked enemy, with its sound |
| Penance | S2 | The weapon slam on Penance and the hit on each enemy every second |
| Haruka | S3, talent | The hit on each floating enemy; the burst on an ally whose bubble breaks and heals, with its sound |
| Tragodia | S2 | The hit on each enemy the summon's burst left delirious, with its sound |
| Thorns the Lodestar | S2 | The hit on every enemy in the drifting alchemy unit, with its sound |
| Hoshiguma the Breacher | S2 | The hit on each enemy the circling shield strikes, with its sound |
| SilverAsh the Reignfrost | S2 | The slash's hit on each enemy |
| Titi | S3 | The burst on each enemy that wakes up, with its sound (instead of the plain wave) |
| Yu | S2 | The teleport effect on each enemy pulled to Yu (instead of the plain flash) |
| Muelsyse | S3 | The pull ring on each melee Flow at every pulse, with its sound |
| Closure | S2 | The refund glow on an operator deployed in range |
| Mechanist | S3 | The hit on each enemy Mechanist blocks |
| Тоска (CN) | S3 | The start effect on the ally that receives the S3 effect |

- 7 new sound files (87 KB) for the server and the preload zip.
