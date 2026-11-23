## 2026-11-22

### Room cards switch to the animated illustrations together, with the official card dissolve

- In the room and the Grand Alliance room, every card keeps its picture until all the cards' animated illustrations are ready. They then start playing behind the pictures, and once the animation runs smoothly, the pictures dissolve away one card after another in quick succession: the pictures dim, then one thin white line in a mint rim sweeps each picture away in about a third of a second, leaving the animated illustration under a faint mint glow that fades.
- A card whose illustration fails keeps its picture and does not hold the others back. A card still loading after 8 seconds keeps its picture too, until the room is opened again, so the cards never switch one by one after the others. A player who sits down later, or a changed outfit, still switches on its own. [src: public/js/ui/dynCards.js:647]
- While the animated cards load, the room no longer stutters: the switch effect is prepared and drawn off the page's own thread where the browser allows it.
- On the result screen, each card's one-time entrance now waits for its animated illustration and plays with it, instead of starting with the picture and switching later. The room cards' illustrations are kept through the match for this, so they usually show at once. When they still need to load after the end-of-match pause, the screen fades to black with a small loading sign and the result screen comes up only when they are ready, never half-built. The black screen lasts at most about 8 seconds after the match ends, even if an animation never starts. [src: public/js/ui/dynCards.js:540]
- On a computer where the animations never run smoothly, the cards keep their pictures instead of showing stuttering animations.
- Before: each card switched on its own as soon as it was ready, with a short fade.

Kind: player

Server cost: none (client display only: no server, network or bot code)
