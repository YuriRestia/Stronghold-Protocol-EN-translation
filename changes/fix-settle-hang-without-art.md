## 2026-11-24

### The result screen no longer waits when no animated illustrations are installed

- A player whose browser has no animated operator illustrations now gets the result screen at once, with the usual still art on the cards.
- Before: the result screen still started the illustration renderer and its background workers, and could sit behind the black cover waiting on files that were never there.

Kind: player

Server cost: none
