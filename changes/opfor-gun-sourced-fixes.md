## 2026-11-24

### Hidden Core OpFor: Gun: calling the carts resets its attack speed

- When the gun calls its carts it now stops shooting and stands for the 5 s of the call, loses the attack speed it built
  up, and then walks on between its next shots, so it can pick another target, as in the official game.
  [src: official enm_pfb_28.ab enemy_9017_achunt Skills/2]
- Before: it kept shooting through its own call at full attack speed, and could stand forever on an operator it could not
  kill.
- The next call comes 45 s after the last one ended, not 45 s after it began. [src: official level_act1autochess_h08_02.json enemy_9017_achunt_2 skill 2]
- The gun plays its own calling animation during the call.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, per room (8 players) | 0 / 0 MB/s [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Server CPU | 0 % of one core: one buff and one timer per gun call, only in a Hidden Core field [src: server/sim/content/bosses.js kitGun] | under 0.1 % [unverified] |
| Memory | 0 MB [src: server/sim/content/bosses.js kitGun keeps no new state] | 0 MB |
| Disk | 0 MB/day [src: server/sim/content/bosses.js writes nothing] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Bandwidth, memory and disk from the code (nothing sent or stored); CPU estimated, not measured.
- Cap: one 5 s cast per gun and call, at most two guns per field [src: server/sim/content/bosses.js kitGun].

News:

- point: {name:enemy_9017_achunt_2} now stops to call its carts, loses its built-up attack speed and then walks on, so it no longer stays on one target forever
  zh: {name:enemy_9017_achunt_2}召唤战车时会停止攻击、失去已提升的攻击速度，随后继续前进，不再一直停在同一个目标前
  ja: {name:enemy_9017_achunt_2}は車両を呼ぶ間は攻撃を止め、上昇した攻撃速度を失った後に再び前進するようになり、同じ対象の前に留まり続けなくなりました
  ko: {name:enemy_9017_achunt_2}: 차량을 부르는 동안 공격을 멈추고 쌓인 공격 속도를 잃은 뒤 다시 이동하여, 더 이상 한 대상 앞에 계속 머물지 않습니다
  zh-TW: {name:enemy_9017_achunt_2}召喚戰車時會停止攻擊、失去已提升的攻擊速度，隨後繼續前進，不再一直停在同一個目標前
