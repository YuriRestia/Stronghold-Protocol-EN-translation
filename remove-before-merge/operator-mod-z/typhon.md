# Typhon

## Mod Z Description

Attributes increased: HP +300

Automatically balances ATK and ASPD (+1% ATK = +1 ASPD). +100 ASPD after being deployed for 10 seconds.

## Commentary

If she has more +ATK, it gets converted into +ASPD. If she has more +ASPD, it gets converted into +ATK. One edge case worth mentioning is that +ASPD bonus is already capped at 500, so in a case where she has more than +500 ASPD, or +1000% ATK, the excess bonus should stay on +ATK, and +ASPD should be capped at 500.

"Balancing" two stats that generally multiply with each other is an elegant concept seen in some other games, and it should work here too. The beauty of it is it means she scales like O(x^2) rather than O(x), whether you get Precision or Agile. It also works with Raid (+50 ASPD), Aegir (devour to gain ATK), and a variety of other buff sources in SPA.

Typhon is a complicated case for which stat is better. +ASPD enables a stunlock on S2, and it will let her chew through her ammo faster on S3 (good for Laterano), however, her whole archetype is based on high damage per hit to deal with high DEF targets, so in most cases, +ATK is better. Mod X gives her ATK +90 and increases her DEF ignore from 50% to 60%, while Mod Y gives her ASPD +7 and 220% ATK on the first two hits of the skill. It's not trivial to do better. But I think, just by providing +100 ASPD on Mod Z, we make sure her baseline is never worse than 150% ATK and 150 ASPD, and this should beat Mod X and Mod Y in 99.9% of cases.

Not entirely sure how operator stat changes are processed, but it is necessary to apply the ATK/ASPD balancing pretty late in the modifier stack to prevent some unintentional interactions (such as only passing on half the buff to Aegir). Additionally, it must be an aura so that it correctly recalculates when ATK or ASPD are buffed/debuffed by other sources.
