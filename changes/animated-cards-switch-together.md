## 2026-11-22

### Room cards switch to the animated illustrations together, smoothly

- In the room and the Grand Alliance room, every card keeps its picture until all the cards' animated illustrations are ready, then they all switch in the same frame with a short fade. A card whose illustration fails keeps its picture and does not hold the others back.
- The illustrations start a moment before they appear, behind the pictures, so the switch itself no longer stutters: the first frames with every card running are the slow ones, and they now pass while the still pictures are shown.
- Before: each card switched on its own as soon as it was ready.

Kind: player

Server cost: none (client display timing only: no server, network or bot code)
