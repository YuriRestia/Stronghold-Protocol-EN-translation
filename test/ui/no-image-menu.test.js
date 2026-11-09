// (fork) A long press on the Operator Loadout's pictures opens no browser image menu (ui/gameComponents.js noImageMenu,
// the user's report of 2026-11-09). The browser check is Dev 5's mobile-emulation run (a real long press through CDP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noImageMenu } from '../../public/js/ui/gameComponents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const press = ({ trusted = true, pointerType = 'touch', on = 'img', prevented = false } = {}) => {
  const e = { isTrusted: trusted, pointerType, defaultPrevented: prevented, prevented: 0,
    target: { closest: (sel) => (sel.split(',').map((s) => s.trim()).includes(on) ? {} : null) } };
  e.preventDefault = () => { e.prevented += 1; e.defaultPrevented = true; };
  return e;
};

test('the browser\'s own long-press menu of a touch or pen press is refused', () => {
  for (const pointerType of ['touch', 'pen', undefined]) {
    const e = press({ pointerType });
    noImageMenu(e);
    assert.equal(e.prevented, 1, String(pointerType));
  }
});

test('a mouse right click, a synthetic long press, a text field and a handled press keep their way', () => {
  const cases = { mouse: press({ pointerType: 'mouse' }), synthetic: press({ trusted: false }), input: press({ on: 'input' }),
    textarea: press({ on: 'textarea' }), editable: press({ on: '[contenteditable]' }), handled: press({ prevented: true }) };
  for (const [name, e] of Object.entries(cases)) {
    noImageMenu(e);
    assert.equal(e.prevented, 0, name);
  }
  noImageMenu(null); // never throws
});

test('every container of the Loadout\'s pictures uses it: the cards, the drawer, the outfit panel and its cards', () => {
  const deck = readFileSync(path.join(ROOT, 'public/js/screens/loadoutDeck.js'), 'utf8');
  assert.match(deck, /class=\$\{cx\('lo-op', `lo-op--t\$\{tier\}`[^>]*onContextMenu=\$\{noImageMenu\}>/, 'DeckOpCard (the deck and the Custom Squad picker)');
  assert.match(deck, /<div class="lo-drawer" data-testid=\$\{testid\} onContextMenu=\$\{noImageMenu\}>/, 'DeckDrawer');
  const outfits = readFileSync(path.join(ROOT, 'public/js/screens/outfits.js'), 'utf8');
  assert.match(outfits, /data-testid="outfit-panel" onContextMenu=\$\{noImageMenu\}>/, 'OutfitPanel (the drawer and the Custom Squad dialog)');
  assert.match(outfits, /class=\$\{cx\('ofit-list'[^>]*onContextMenu=\$\{noImageMenu\}>/, 'OutfitCards');
  // the pictures themselves stay undraggable
  assert.match(readFileSync(path.join(ROOT, 'public/js/ui/gameComponents.js'), 'utf8'), /<img class=\$\{cls\} src=\$\{src\} alt=\$\{alt\} draggable=\$\{false\}/);
});
