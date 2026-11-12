## 2026-11-12

### The difficulty list no longer twitches

- On Select Simulation Protocol, the difficulty cards stay in one layout. At some window sizes they flipped every few
  frames between the long cards with a scrollbar and the short cards, moving the list up and down (a player's report).
- Before: the long cards were kept when they overflowed by under a pixel, which showed a scrollbar. The scrollbar
  narrowed the list, and the narrower list was measured again and changed the layout back.
