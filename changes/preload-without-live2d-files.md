## 2026-11-24

### Preload accepts larger art lists and leaves the Live2D cards out

- Settings ▸ Preload Assets works again with the Live2D cards installed: the list of files it accepts grew from 60,000 to 100,000, and the cards' own files (they load when a card shows) are not on it.
- Before: with the cards installed the list had 70,608 files, so the preload and the zip import stopped with "resource manifest has no file list". This build was never released.

Kind: internal

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out, per player, the list only | 1.04 MB once per release [src: shared/resources.js:24 comment, measured 2026-11-24] | 1.9 MB once per release [src: shared/resources.js:24 comment, estimated for 100,000 entries] |
| Bandwidth out, per player who preloads the standard pack | 1,140 MB once per release, 0 otherwise [src: I:/ClaudeCrew/work/dev-62/packs.mjs, visual 1,032 MB + audio 108 MB on 2026-11-24; a player downloads only changed files] | 10 MB/s for 2 min [unverified] |
| The same with the Live2D files left in | 1,757 MB [src: I:/ClaudeCrew/work/dev-62/packs.mjs, + 616 MB] | as left |
| Bandwidth out, per room (8 players all preloading) | 9.1 GB once per release, 0 MB/s in play [unverified] | 80 MB/s for 2 min [unverified] |
| Bandwidth out, 300 players all preloading the same day | 342 GB/day [unverified] | 3,000 MB/s for 2 min without a CDN [unverified] |
| Bandwidth in, memory, disk | 0 MB [src: server/resources.js:64, the list is built once per boot as before, 14,524 fewer files] | 0 MB |
| Server CPU | 0 % [unverified] | 0 % [unverified] |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: the list holds at most 100,000 files [src: shared/resources.js:31 MAX_MANIFEST_FILES]; the server warns at boot when it is over. Preloading is the player's choice and only changed files download.
- Measured: file counts, pack sizes, the list's gzip size. Estimated: the rates and the all-at-once worst cases.
