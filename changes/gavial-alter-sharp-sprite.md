## 2026-11-15

### Gavial the Invincible and other masked operator models no longer look blurry

- Operators whose models cut part of their art with a mask (Gavial the Invincible and a few others) are drawn through
  a cached image. That image now lands on whole screen pixels, so these operators look as sharp as the operators
  around them.
- Before: the cached image sat between pixels and was smoothed a second time, so these operators looked soft next to
  the rest of the board.

Kind: player

Server cost: none (client rendering only: render/units.js)
