## 2026-11-11

### Chat in the alliance room

- The room screen (4 players or a Grand Alliance's 8) has a chat log under the seat cards: time, name (squad A green, squad B blue, yours gold) and the line, plus who joined or left. Scroll up to read back; a "↓ N new messages" button brings you down again, and ⤢ makes the log taller.
- Each line also pops a bubble over the sender's seat card, emotes too. The mute button on each player's name plate hides their bubbles and their lines (the same mute list as in the match).
- On a phone the log is a Chat button with an unread count and the last line; tap it to open the log over the left half of the screen.
- No kill wallet in the room: anyone seated can talk, up to 100 letters a line. Spectators can read along.
- Spam limits: one line every 1.5 s, 6 lines in any 15 s and 20 lines in any 5 minutes; going over pauses your chat for 30 s, then 60 s, then 120 s. The same line twice within 10 s is dropped. Reconnecting does not reset a pause.
- If the whole server's chat gets too busy, a line is not sent and you see "Chat is busy. Try again in a moment."
- If you lose the connection and come back, you get the lines you had already seen. Someone who joins later does not see older lines. Chat is kept only in the server's memory, never saved, and is gone when the room closes.

### Plain text in both chats

- Match chat and room chat now take plain text only: letters of every language, digits, punctuation, currency signs and a few maths signs. HTML tags, emoji, symbols, invisible characters and "Zalgo" stacks of accents are removed; fancy-font letters become normal letters.
- Before: match chat let emoji and any other character through.
- A match chat line is also at most 100 letters now, whatever your kill wallet holds, and the same spam limits and busy check apply there.

### Server cost

- CPU: the text filter takes 1.3 µs for a typical line and at most ≈ 260 µs (measured); one run per player per 1.5 s at most, so ≤ 5 % of one core at 300 players in the absolute worst case, about 0 % typically. Sending stays under 0.1 % of a core at the budget.
- Memory: ≤ 16 KB of history per room and under 1 KB of limits per player: ≈ 1.5 MB at 300 players, ≤ 16 MB at the server's 1,000-room limit. Disk: none (nothing is logged or saved). Bot budget: none.
