## 2026-11-23

### Animated room cards: an official home background behind each illustration

- In a Team Simulation room and the Grand Alliance room, each animated card now shows one of the game's own home screen backgrounds behind its operator, chosen to fit the outfit or the operator's faction (a beach for summer outfits, the Sui siblings' green fields, Laterano's clear sky, and so on). Where an illustration's scene ends before the wide card does, the background fills the rest instead of the card's dark back.
- The illustration and its still picture cast a soft shadow onto the background, so a scene's torn edge sits on it instead of being cut off.
- The still picture a card shows before its animation starts, or with animated illustrations turned off, has the same background, and the switch to the animation keeps it.
- Before: the card's dark back showed through wherever a scene ended inside the card.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player (game socket) | 0 MB/s: no message, no new field [src: git diff dev-0.2: no server/ or shared/protocol change] | 0 MB/s |
| Backgrounds a player downloads (static files behind Cloudflare) | 96 KB per background the first time a player sees it: 24 backgrounds, 2,307,320 B in all [src: work/dev-59 homebg-manifest.json and its homebg/ folder] | the largest is 159,004 B [src: work/dev-59 homebg/bg_laterano_1.webp] |
| Per room | a 4-seat room up to 0.38 MB cold, a Grand Alliance room up to 0.77 MB cold, then cached [unverified] (arithmetic: 4 / 8 × 96 KB) | a Grand Alliance room of 8 different, largest ones: 1.27 MB cold [unverified] (arithmetic: 8 × 159,004 B) |
| 300 players | 0.23 GB/day [unverified] (estimated: each player sees 8 new backgrounds a day, then cached) | cache rule broken, 300 players in Grand Alliance rooms, 8 backgrounds a match each, all from the origin: 0.09 MB/s, 7.4 GB/day [unverified] (estimated: 300 × 8 × 96 KB ÷ 2,700 s per match) |
| Origin, both servers | 0.00005 MB/s, 0.005 GB/day [unverified] (estimated: each server's set of 2.3 MB refills once a day) | as the 300-player worst case |
| Server CPU | 0 % of one core [unverified] (static files) | 0 % [unverified] |
| Memory | 0 MB [unverified] | 0 MB [unverified] |
| Disk | 0 MB/day; +2.3 MB once, the extracted backgrounds [src: work/dev-59 homebg/] | 40 MB once: the extractor's cap [src: tools/local-extract/homebg.py HOMEBG_MAX_BYTES] |
| Bot budget | 0 ms/round [src: git diff dev-0.2: no bot code changed] | 0 ms/round |

- Cap: the backgrounds data/dyn-card-background.json uses, 24 today, at most 40 files and 40 MB a run [src: tools/local-extract/homebg.py HOMEBG_MAX_FILES, HOMEBG_MAX_BYTES]; a card downloads only its own one, a 1280 × 720 WebP.

Operator notes:

- After the merge, on each server and in the main checkout: `extract.py --only homebg` (or the next `--only dynillust` run) writes `public/assets/local/homebg/` and the `homebg` group of `data/local-assets.json`. Without it the cards keep their dark back; nothing breaks.
