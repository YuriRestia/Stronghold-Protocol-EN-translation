## 2026-11-11

### AI players in a player's browser can use Ioleta's adaptive AI

- New server setting `SP_HOST_BOT_STRATEGY` picks the AI that bots play when they run in a human's browser (`SP_BOT_EXECUTION=host`, and every Grand Alliance room). Bots the server plays itself keep the original AI, and a per-seat setting still wins. Unset, nothing changes.
- An unknown AI name in the setting stops the server at startup with a clear message.
- New tool `tools/hostbotbench.mjs` times the real browser bot Worker in a GPU Chrome over whole matches, per AI and room size, against the bot time budget.
- Measured on a desktop (14 preps, the same boards for both AIs): Ioleta's adaptive AI thinks less than the original. A whole round of bots took 3.8 s at the median and 18 s in the slowest round with 4 players (original AI: 6.4 s and 34 s), and 12.8 s and 79 s with 8 players (original AI: 17.1 s and 134 s). Only the last prep goes over the bot budget (42 s typical, 60 s there); the bots then place the best layout tried so far.
