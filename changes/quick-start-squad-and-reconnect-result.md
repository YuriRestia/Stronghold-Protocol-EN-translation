## 2026-11-12

### A quick start keeps your custom squad

- Settings chosen in the lobby (your custom squad and the other room settings that wait for the game data) are sent the moment you enter a room.
- Before: they went out 50 ms later, so pressing Start right after the room appeared could start the match without your custom squad.
- Ported from upstream ([`54d24b2b`](https://github.com/sganggs/Stronghold-Protocol/commit/54d24b2b32d4a1ad8a5f43ee79b61eb562b1b5b7), thanks to @sganggs).

### Reconnecting after the match ended shows your result

- A player whose connection dropped during a match and who comes back after it ended now sees the result screen and their own result, once, even when the room has closed in the meantime.
- Before: if the room was closed before they came back (for example a matchmade room that removed them while waiting for game data), they got no result and sat on the paused board until their session expired. Coming back after the room's own waiting time ran out already worked.
- Ported from upstream's open [PR #912](https://github.com/sganggs/Stronghold-Protocol/pull/912), thanks to @SatsumaUton.
