## 2026-11-24

### Live2D card art is an optional preload item

- Settings ▸ Preload Assets has a new row, "Live2D Card Art", for the animated card illustrations. It is unticked by default; tick it to save all 14,524 files (about 616 MB) in this browser so the cards never wait for a download. Untick it and use its own "Remove Unticked Live2D Card Art" button to delete them again.
- Players who preloaded before are not asked for anything new: the row stays unticked until they tick it.
- Import zip takes a second zip, built with `npm run package:preload -- --live2d`, for hosts who share the art somewhere else; the standard preload zip does not hold these files.
- Before: the Live2D files were left out of the preload entirely and always downloaded when a card showed.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out, per player, the file list | +0.29 MB gzipped once per release (1.04 MB to 1.33 MB) [src: shared/resources.js:27, measured 2026-11-24] | +0.29 MB [src: shared/resources.js:27] |
| Bandwidth out, per player who ticks Live2D | 616 MB once per release (only changed files after that), 5-10 MB/s for 1-2 min [unverified]; 0 for a player who does not tick it [src: sum of the 14,524 files under public/assets/local/dynillust/, 616,470,540 bytes on 2026-11-24] | 616 MB from the origin on a Cloudflare miss at the same rate [unverified] |
| Bandwidth out, origin, with Cloudflare hits | 3-6 GB per release in total, whatever the player count: each file once per Cloudflare data centre, 616 MB x 5-10 data centres [unverified] | the same again for each round of cache eviction [unverified] |
| Bandwidth out, per room (8 players all ticking) | about 0 extra with Cloudflare hits; 4.9 GB once without them [src: 8 x 616 MB] | 4.9 GB in 1-2 min, 40-80 MB/s without Cloudflare [unverified] |
| Bandwidth out, 300 players | 3-6 GB/day with hits [unverified]; 55 GB/day if 30 % tick it the same day without Cloudflare [src: 90 x 616 MB] | 185 GB/day, 1,500-3,000 MB/s for 1-2 min, if all 300 tick it the same day without Cloudflare [src: 300 x 616 MB] |
| Bandwidth in | 0 MB/s [src: no upload path changed] | 0 MB/s |
| Server CPU | 0 % in play; the first boot after a deploy hashes the 616 MB once, about 9 s on one worker [src: docs/ASSETS.md Preload, cold build about 12 s for 820 MB, scaled] | the same, once per boot |
| Memory | +1.5 MB for 14,524 more list entries [unverified] | +1.5 MB [unverified] |
| Disk | +1.5 MB once in the hash cache file, 0 MB/day after [unverified] | +1.5 MB [unverified] |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: the list holds at most 100,000 files, 70,622 with the Live2D files [src: shared/resources.js:31 MAX_MANIFEST_FILES]; each pack is the player's tick; a file over 24 MiB is never listed [src: shared/resources.js:23 MAX_FILE_BYTES].
- Cloudflare: the existing "game assets" Cache Rule (path starts with `/assets/`, use the cache-control header) already covers `/assets/local/dynillust/`, and the server sends `public, max-age=31536000, immutable` for the cards' `/assets/~<hash>/…` URLs and the preload's `?v=` URLs [src: server/http/files.js:270 cacheControlFor, checked on a local server 2026-11-24]. The live site returns `cf-cache-status: HIT` with that header for `.png`, `.skel` and `.atlas` files under `/assets/~<hash>/` [measured 2026-11-24, HEAD requests]. No dashboard change is needed; the Live2D files themselves were not yet on the live site to check.
- Measured: the sizes and file counts, the response headers, the Cloudflare HIT on other art [src: this fragment's Cloudflare line]. Estimated: the rates, the data-centre count, CPU, memory and disk [unverified].

Operator notes:

- After the next deploy, check Cloudflare caching of a Live2D file: open the game with F12 ▸ Network, tick the Live2D row, then load a Live2D file twice (reload with the cache disabled) and read `cf-cache-status`: the second answer is `HIT`.
