## 2026-11-12

### AI teammates play again

- Fixed: AI teammates did nothing all match: no strategy, no units bought or placed, funds left unspent. This hit every
  match with an AI seat since bots started running in the players' browsers: AI teammates in solo and co-op rooms, the
  AI seats matchmaking adds, and the AI that takes over a seat. A file the browser's bot needs was not served to it,
  so the bot could never start.
