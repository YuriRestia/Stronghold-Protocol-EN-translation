## 2026-11-13

### Vendela's skill no longer taunts a summon

- Vendela's skill gives the taunt to the operator with the highest max HP in her attack range, as in the official
  game. Before: a summon with more max HP in her range took the taunt instead.
- Vendela taunting herself is official: when no operator in her range has more max HP than she does, she is the one
  the skill picks (client skill data: the selector does not leave her out). That is unchanged.
- Her talent's healing bonus follows the same rule: it goes to the operator with the highest max HP, never a summon.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s |
| Server CPU | 0 % of one core | 0 % of one core |
| Memory | 0 MB | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: unchanged. The skill still picks one unit when it starts; the pick only leaves summons out of the same list.
- Estimated from the code, not measured: `server/sim/content/kits/ops/chess_char_1_06-vendla.js` filters the
  candidates it already sorted; no new state, event or snapshot field.

News:

- point: {name:char_494_vendla}'s skill now taunts the operator with the highest max HP in her range, never a summon
  zh: {name:char_494_vendla}的技能现在会嘲讽攻击范围内生命上限最高的干员，不再选中召唤物
  ja: {name:char_494_vendla}のスキルは、攻撃範囲内で最大HPが最も高いオペレーターを挑発対象にし、召喚ユニットを選ばなくなりました
  ko: {name:char_494_vendla}의 스킬이 이제 공격 범위 내 최대 HP가 가장 높은 오퍼레이터에게 도발을 걸며, 소환물은 선택하지 않습니다
  zh-TW: {name:char_494_vendla}的技能現在會嘲諷攻擊範圍內生命上限最高的幹員，不再選中召喚物
