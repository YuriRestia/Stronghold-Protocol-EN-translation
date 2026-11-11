## 2026-11-11

### Plain-text nicknames

- Doctor names follow the same plain-text rules as chat: letters of every language, digits, punctuation and a few signs. Emoji, symbols, HTML tags, invisible "filler" characters and "Zalgo" stacks are removed, and fancy-font letters become normal letters.
- Before: a name could hold emoji, symbols or invisible filler characters (blank-looking names).
- A name made only of removed characters counts as empty, so the title screen asks for another one.

### Server cost

- Server cost: none. The same filter runs once per hello on a name of at most 12 characters (about 1 µs); no new messages, memory or disk.
