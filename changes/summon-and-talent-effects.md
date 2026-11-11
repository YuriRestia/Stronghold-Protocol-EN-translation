## 2026-11-11

### Summon and talent effects from the game client (part 1)

The game client defines effects for summons and for talents that we never drew. This part adds:

- **Summons know their summoner.** Each summon now tells the game which operator summoned it, so that operator's effects can play on it. Kal'tsit's Mon3tr now shows her S1–S3 buffs, Pozëmka's sub-bow shows hers, Closure's command center shows its S2 and S3 range loops, and Vigil's wolves and Mechanist's summons show their skill buffs.
- **Muelsyse's clones.** A clone that splits during S3 now plays the official split effect, and its official end effect where it stood when it goes.
- **Talent effects on other units.** Pallas's Peak Performance glow on the allies that have it, and her S3 blessing; Texas the Omertosa's S1 cut on the enemies it hits; Eunectes's S2 stun on the enemy she blocks; Astgenne the Lightchaser's S3 link on each linked enemy; Ho'olheyak's S3 lift; Insider's ammo grant on the chosen ally; Shu's S3 seed mark on marked enemies.
- **Talents that fire at a moment.** Necrass's skeleton upgrade glow and her S3 special skeleton's growth; Kal'tsit Esperanta's S3 teleport out and landing; Typhon's S3 aim; Narantuya's S3 boomerang return.
- **Sandbox.** A new `&tokens=` link parameter places summon pieces next to their summoner (Mon3tr, Closure's command center).

### Summon and talent effects from the game client (part 2)

Talent and trait effects that depend on what is happening in the battle now show while that holds:

- **Ready and charged states.** Papyrus's and Lessing's glow while S1 is ready; Leizi the Thunderbringer's and Młynar's trait glow grows with their attack ramp.
- **Effects while something lasts.** Nasti's S2 shield while it holds; Lucilla's S2 talent boost while S2 runs; Heavyrain's S2 aura on the allies inside it; Humus's recycle shield while it holds; Lee's guard while it is up, and its hit when it cancels a stun.
- **Marks and moments.** Carnelian's S3 mark on enemies, part-charged and full; Swire the Elegant Wit's merchant payment and revive; Humus's trait heal; Aroma's S2 landing; Тоска's heal and SP grant on the ally.
