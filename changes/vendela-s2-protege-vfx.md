## 2026-11-15

### Vendela's second skill shows its thorns on the ally she protects

- With the official effects on, Vendela's second skill now loops its thorn glow on the operator it taunts (the one with the most max HP in her range, or herself when no one in range has more), for as long as the skill lasts. It goes when the skill ends or that operator is knocked out.
- Her counter's hit effect now plays on the enemy that attacked the protected operator.
- Before: the glow always sat on Vendela, whoever she taunted, and the hit effect played on her whenever she took damage.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: crew-rules.md SERVER COST, battles run in the players' browsers (Match clientCombat), sim fx and b.snap fxs never cross the server] | 0 / 0 MB/s |
| Bandwidth out / in, per room | 0 / 0 MB/s [src: as above] | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: as above] | 0 / 0 MB/s |
| Legacy SP_COMBAT=server only | 12 bytes more per counter fx (`"target":123`) and one fxs row diff of about 34 bytes on and off per S2 cast [src: I:/ClaudeCrew/work/dev-42 JSON.stringify lengths] | the same per counter, one counter per hit on the protégé while S2 runs |
| Server CPU | 0 % of one core [src: no server code runs it in client combat] | 0 % |
| Memory | 0 MB [src: no state kept on the server] | 0 MB |
| Disk | 0 MB/day [src: nothing written] | 0 MB/day |
| Bot budget | under 0.01 ms/round [unverified] (one buff field and one fx field per S2 cast / counter in the host browser's sim) | the same |

- Cap: one fxs row per S2 cast (the protégé's taunt buff) and one `target` field per counter [src: server/sim/content/kits/ops/chess_char_1_06-vendla.js onStart / observeInjury].
- The zeros follow from client combat (no measurement needed); the legacy bytes are measured JSON lengths; the bot cost is estimated.

News:

- point: {name:char_494_vendla}'s second skill now shows its thorns on the ally she protects, and its counter hit on the attacker
  zh: {name:char_494_vendla}的二技能现在会在她保护的干员身上显示荆棘特效，反击命中特效显示在攻击者身上
  ja: {name:char_494_vendla}のスキル2の茨エフェクトが守る味方に表示され、反撃のヒットエフェクトは攻撃者に表示されるようになりました
  ko: {name:char_494_vendla}의 2스킬 가시 이펙트가 이제 보호하는 아군에게 표시되고, 반격 타격 이펙트는 공격자에게 표시됩니다
  zh-TW: {name:char_494_vendla}的二技能現在會在她保護的幹員身上顯示荊棘特效，反擊命中特效顯示在攻擊者身上
