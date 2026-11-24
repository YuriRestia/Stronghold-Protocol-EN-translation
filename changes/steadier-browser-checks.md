## 2026-11-24

### Four browser checks stop failing for reasons of their own

- The in-match test page (`/dev/game-mock.html`) now holds its first battle step until the game listens, so the stage-device card checks see the crates' spawn events.
- The cold-cache band check holds each sprite once, as a real cold cache does, instead of a second time.
- The shop-strip check waits for the purchase to show instead of a fixed 450 ms.
- The 爬行模式 check measures the crawl from the frame that shows it.

Kind: internal

Server cost: none (tooling and tests only)
