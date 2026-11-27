## 2026-11-27

### Pushed and pulled enemies slide on every tick

- A push or pull now always slides the enemy to where it lands.
- Before: on game ticks whose time rounds down to the millisecond, the enemy jumped most of the way in one frame and crawled the rest. The snapshot's time is rounded to the ms while the battle's events carry the exact time, so the push's start was missed by the look-ahead in `render/app.js` [src: server/sim/battle/events.js snapshot `Math.round(this.time * 1000) / 1000`; public/js/battle/simHost.js `gt: Number(b.time)`].

Kind: player

Server cost: none
