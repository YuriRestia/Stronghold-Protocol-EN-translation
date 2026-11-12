## 2026-11-13

### Update news written in every language with each change

- A player change that is news now carries its update news line(s) in English, Chinese, Japanese, Korean and
  Traditional Chinese in its changelog fragment (a `News:` block), with operator and mode names taken from the game
  data by id. `npm run changelog` checks every language, the names, the colour tags and the line length.
- The release builds the update news from these blocks in all five languages, shows each line with its translations
  in Notepad, and stops on a line whose English was rewritten or added there (or ships it in English with
  `--english-only`).

Kind: internal

Server cost:

The release now writes the live news in all five languages instead of English only. The game server already sends the
whole news file (every language) to each player once on each lobby hello (a page load or reconnect) and once to
everyone when new news goes live; that code is unchanged, only the file is bigger. Measured on the draft from the
current built-in news: 1.6 KB in English only, 8.6 KB with all five languages, so +7 KB per hello. The worst case is
the news size cap that already existed (32 KB, shared/news.js NEWS_MAX_BYTES).

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | +7 KB per hello, about 20 hellos a day: 0.14 MB/day, under 0.00001 MB/s (0.0001 GB/day) / 0 | 32 KB per hello, 20 a day: 0.64 MB/day (0.0006 GB/day) / 0 |
| Bandwidth out / in, per room (4 players) | 4 x the player figure: under 0.00001 MB/s / 0 | 2.6 MB/day / 0 |
| Bandwidth out / in, 300 players | 42 MB/day (0.04 GB/day), 0.0005 MB/s averaged; 2.6 MB at once when news goes live (once per release) | 192 MB/day (0.19 GB/day), 0.002 MB/s averaged; 9.6 MB at once per release |
| Per release, PC to each server (the news upload) | 9 KB | 32 KB |
| Server CPU | 0 % of one core (same frames, a few KB more) | 0 % |
| Memory | +7 KB (the news in force) | 32 KB |
| Disk | 0 MB/day (one news file per release, about 10 KB) | 64 KB per release |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: the news is refused above 32 KB (NEWS_MAX_BYTES, checked by the release and by the server). On the operator's
  PC, logs/news-<id>.json is capped at 64 KB (NEWS_FILE_MAX), the Notepad text and the kept
  logs/news-<id>.draft.txt at 256 KB each (MAX_EDIT_BYTES); the Notepad temp file and the kept draft are deleted once
  the news is saved. Operator-only: the files are written only when the operator runs the release.
- Measured: the five-language news built from the current built-in news with tools/news-block.mjs names (8,567 bytes
  compact, 9,634 bytes as saved). Hellos per player per day estimated.
