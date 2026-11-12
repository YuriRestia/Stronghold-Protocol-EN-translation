## 2026-11-13

### Update news written in every language with each change

- A player change that is news now carries its update news line(s) in English, Chinese, Japanese, Korean and
  Traditional Chinese in its changelog fragment (a `News:` block), with operator and mode names taken from the game
  data by id. `npm run changelog` checks every language, the names, the colour tags and the line length.
- The release builds the update news from these blocks in all five languages, shows each line with its translations
  in Notepad, and stops on a line whose English was rewritten or added there (or ships it in English with
  `--english-only`).

Kind: internal

Server cost: none
