// 0.2.0 rebindable shortcuts (设置 → 快捷键; the community request 「快捷键可不可以自己设置」, the owner's decision of
// 2026-10-07): the key map in the settings (ui/gameLogic/shortcuts.js, ui/gameLogic/settings.js sanitizeSettings) —
// defaults = the keys of 0.1.4, sanitising and its fallback to the defaults, conflicts swapped, the one lookup every
// handler uses, the capture of a new key — the handlers with a rebound key, and the HUD's key hints read from the map.
// Browser counterpart: test/ui/hotkeys.e2e.test.js (SP_E2E=1).

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOTKEY_ACTIONS, DEFAULT_HOTKEYS, isBindableCode, hotkeyLabel, sanitizeHotkeys, rebindHotkey, isDefaultHotkeys, hotkeyOf,
  actionForKey, captureHotkey, facingSwallows, facingEnter, shortcutFor, shortcutBlocked, sanitizeSettings, DEFAULT_SETTINGS,
} from '../../public/js/ui/gameLogic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// the bindable codes, as the settings offer them
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`);
const DIGITS = [...'0123456789'].map((c) => `Digit${c}`);
const PUNCT = ['Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'];
const NAMED = ['Space', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'];
const BINDABLE = [...LETTERS, ...DIGITS, ...PUNCT, ...NAMED];
const RESERVED = ['Escape', 'Tab', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F5', 'F12',
  'ShiftLeft', 'ControlLeft', 'AltLeft', 'MetaLeft', 'CapsLock', 'Backspace', 'ContextMenu', 'IntlBackslash', '', 'keyq', 'constructor', '__proto__'];

const rebound = { ...DEFAULT_HOTKEYS, retreat: 'KeyW' };

describe('the key map: defaults and labels', () => {
  test('the defaults are the keys of 0.1.4 (R / F / D / Q / X / Space), in the settings order', () => {
    assert.deepEqual([...HOTKEY_ACTIONS], ['refresh', 'freeze', 'levelUp', 'retreat', 'sell', 'ready']);
    assert.deepEqual({ ...DEFAULT_HOTKEYS }, { refresh: 'KeyR', freeze: 'KeyF', levelUp: 'KeyD', retreat: 'KeyQ', sell: 'KeyX', ready: 'Space' });
    assert.deepEqual(HOTKEY_ACTIONS.map((a) => hotkeyLabel(DEFAULT_HOTKEYS[a])), ['R', 'F', 'D', 'Q', 'X', 'Space']);
    assert.ok(Object.isFrozen(DEFAULT_HOTKEYS) && Object.isFrozen(HOTKEY_ACTIONS));
    assert.equal(DEFAULT_SETTINGS.keys, DEFAULT_HOTKEYS, 'the settings default is the same map');
    assert.deepEqual(sanitizeSettings(null).keys, { ...DEFAULT_HOTKEYS });
    assert.deepEqual(sanitizeSettings({ bgm: 0.4 }).keys, { ...DEFAULT_HOTKEYS }, 'a profile saved before 0.2.0 (no keys) keeps the old keys');
    assert.equal(isDefaultHotkeys(DEFAULT_HOTKEYS), true);
    assert.equal(isDefaultHotkeys(rebound), false);
  });

  test('which keys may be a shortcut, and how each is shown', () => {
    for (const c of BINDABLE) assert.equal(isBindableCode(c), true, c);
    for (const c of RESERVED) assert.equal(isBindableCode(c), false, c);
    for (const v of [null, undefined, 3, {}, ['KeyQ']]) assert.equal(isBindableCode(v), false);
    assert.equal(hotkeyLabel('KeyW'), 'W');
    assert.equal(hotkeyLabel('Digit7'), '7');
    assert.equal(hotkeyLabel('Comma'), ',');
    assert.equal(hotkeyLabel('Backslash'), '\\');
    assert.equal(hotkeyLabel('Space'), 'Space');
    assert.equal(hotkeyLabel('Delete'), 'Delete');
    assert.equal(hotkeyLabel('PageUp'), 'PageUp');
    assert.equal(hotkeyLabel('Escape'), '');
    assert.equal(hotkeyLabel(undefined), '');
  });
});

describe('the key map: sanitising (the settings store, localStorage sp.pref.settings)', () => {
  test('a valid map is kept as saved; it survives the JSON round trip of the store', () => {
    const mine = { refresh: 'KeyG', freeze: 'Digit2', levelUp: 'Comma', retreat: 'KeyW', sell: 'Delete', ready: 'KeyE' };
    assert.deepEqual(sanitizeHotkeys(mine), mine);
    const saved = JSON.parse(JSON.stringify(sanitizeSettings({ bgm: 0.3, keys: mine })));
    assert.deepEqual(sanitizeSettings(saved).keys, mine);
    assert.equal(sanitizeSettings(saved).bgm, 0.3);
  });

  test('bad entries fall back to their default; unknown actions are dropped', () => {
    assert.deepEqual(sanitizeHotkeys({ retreat: 'KeyW', sell: 'Escape', ready: 42 }), { ...DEFAULT_HOTKEYS, retreat: 'KeyW' });
    assert.deepEqual(sanitizeHotkeys({ ...DEFAULT_HOTKEYS, pen: 'KeyP', toString: 'KeyT' }), { ...DEFAULT_HOTKEYS });
    for (const c of RESERVED) assert.deepEqual(sanitizeHotkeys({ refresh: c }), { ...DEFAULT_HOTKEYS }, c);
    // keys of the prototype are not saved keys
    assert.deepEqual(sanitizeHotkeys(Object.create({ refresh: 'KeyG' })), { ...DEFAULT_HOTKEYS });
    assert.deepEqual(sanitizeHotkeys(JSON.parse('{"__proto__": {"refresh": "KeyG"}, "sell": "KeyV"}')), { ...DEFAULT_HOTKEYS, sell: 'KeyV' });
  });

  test('bad data — not a map, or two actions on one key — gives the defaults', () => {
    for (const raw of [null, undefined, 'KeyQ', 7, true, [], ['KeyW'], () => 'KeyQ']) assert.deepEqual(sanitizeHotkeys(raw), { ...DEFAULT_HOTKEYS }, String(raw));
    assert.deepEqual(sanitizeHotkeys({ ...DEFAULT_HOTKEYS, sell: 'KeyQ' }), { ...DEFAULT_HOTKEYS }, 'retreat and sell on Q');
    // an invalid entry whose default another action now holds is a conflict too
    assert.deepEqual(sanitizeHotkeys({ refresh: 'KeyF', freeze: 'nonsense' }), { ...DEFAULT_HOTKEYS });
    assert.deepEqual(sanitizeSettings({ quality: 'low', keys: { ready: 'KeyR' } }).keys, { ...DEFAULT_HOTKEYS });
    assert.equal(sanitizeSettings({ quality: 'low', keys: { ready: 'KeyR' } }).quality, 'low', 'the other settings are kept');
  });
});

describe('the key map: rebinding and conflicts', () => {
  test('a free key just moves the action', () => {
    const r = rebindHotkey(DEFAULT_HOTKEYS, 'retreat', 'KeyW');
    assert.deepEqual(r, { keys: rebound, changed: true, swapped: null });
    assert.deepEqual({ ...DEFAULT_HOTKEYS }, { refresh: 'KeyR', freeze: 'KeyF', levelUp: 'KeyD', retreat: 'KeyQ', sell: 'KeyX', ready: 'Space' }, 'the defaults are untouched');
  });

  test('a key another action holds is swapped: that action takes the old key', () => {
    const r = rebindHotkey(DEFAULT_HOTKEYS, 'retreat', 'KeyX');
    assert.equal(r.changed, true);
    assert.equal(r.swapped, 'sell');
    assert.deepEqual(r.keys, { ...DEFAULT_HOTKEYS, retreat: 'KeyX', sell: 'KeyQ' });
    const back = rebindHotkey(r.keys, 'ready', 'KeyQ');
    assert.deepEqual(back.keys, { ...DEFAULT_HOTKEYS, retreat: 'KeyX', sell: 'Space', ready: 'KeyQ' });
    assert.equal(back.swapped, 'sell');
  });

  test('the same key, an unknown action or a reserved key change nothing', () => {
    assert.deepEqual(rebindHotkey(DEFAULT_HOTKEYS, 'retreat', 'KeyQ'), { keys: { ...DEFAULT_HOTKEYS }, changed: false, swapped: null });
    for (const [action, code] of [['pen', 'KeyP'], ['escape', 'KeyE'], ['retreat', 'Escape'], ['retreat', 'Enter'], ['retreat', 'ArrowUp'], ['retreat', 'F5']]) {
      assert.deepEqual(rebindHotkey(DEFAULT_HOTKEYS, action, code), { keys: { ...DEFAULT_HOTKEYS }, changed: false, swapped: null }, `${action} ${code}`);
    }
  });

  test('whatever is rebound, every action keeps exactly one key and no key does two things', () => {
    let keys = { ...DEFAULT_HOTKEYS };
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let i = 0; i < 2000; i++) {
      keys = rebindHotkey(keys, HOTKEY_ACTIONS[rnd(HOTKEY_ACTIONS.length)], BINDABLE[rnd(BINDABLE.length)]).keys;
      assert.equal(new Set(Object.values(keys)).size, HOTKEY_ACTIONS.length);
      assert.deepEqual(sanitizeHotkeys(keys), keys, 'a rebound map is a valid saved map');
    }
  });
});

// the matcher of 0.1.4 (ui/gameLogic/shortcuts.js before 0.2.0): `code === 'KeyR' || key === 'r'`, in this order
function oldShortcut(e) {
  const code = e.code || '';
  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (code === 'KeyR' || key === 'r') return 'refresh';
  if (code === 'KeyF' || key === 'f') return 'freeze';
  if (code === 'KeyD' || key === 'd') return 'levelUp';
  if (code === 'KeyQ' || key === 'q') return 'retreat';
  if (code === 'KeyX' || key === 'x') return 'sell';
  if (code === 'Space' || key === ' ') return 'ready';
  return null;
}

describe('the one lookup (actionForKey) and shortcutFor', () => {
  test('with the defaults nothing changes: the 0.1.4 matcher on QWERTY, AZERTY, Dvorak and Russian presses', () => {
    const qwerty = [...LETTERS.map((c) => ({ code: c, key: c.slice(3).toLowerCase() })), ...DIGITS.map((c) => ({ code: c, key: c.slice(5) })), { code: 'Space', key: ' ' }];
    // AZERTY: A↔Q, Z↔W, M on the ; key; Dvorak: the US positions typing Dvorak letters; Russian: Cyrillic letters by position
    const azerty = { KeyQ: 'a', KeyA: 'q', KeyW: 'z', KeyZ: 'w', Semicolon: 'm', KeyM: ',' };
    const dvorak = { KeyQ: "'", KeyW: ',', KeyE: '.', KeyR: 'p', KeyT: 'y', KeyY: 'f', KeyU: 'g', KeyI: 'c', KeyO: 'r', KeyP: 'l', KeyS: 'o', KeyD: 'e', KeyF: 'u', KeyG: 'i', KeyH: 'd', KeyJ: 'h', KeyK: 't', KeyL: 'n', KeyZ: ';', KeyX: 'q', KeyC: 'j', KeyV: 'k', KeyB: 'x', KeyN: 'b', KeyM: 'm' };
    const russian = { KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyF: 'а', KeyD: 'в', KeyX: 'ч', KeyA: 'ф' };
    const layout = (m) => Object.entries(m).map(([code, key]) => ({ code, key }));
    const presses = [...qwerty, ...layout(azerty), ...layout(dvorak), ...layout(russian), { code: 'KeyR', key: 'Process' }, { code: 'KeyQ', key: 'Unidentified' },
      { key: 'r' }, { key: 'X' }, { code: 'KeyD' }, { key: ' ' }, { code: 'Digit1', key: '!' }, { code: 'ArrowUp', key: 'ArrowUp' }, { code: 'Enter', key: 'Enter' }, {}];
    for (const e of [...presses, ...presses.map((p) => ({ ...p, key: typeof p.key === 'string' ? p.key.toUpperCase() : p.key, shiftKey: true }))]) {
      assert.equal(actionForKey(e), oldShortcut(e), JSON.stringify(e));
      assert.equal(actionForKey(e, DEFAULT_HOTKEYS), oldShortcut(e));
      assert.equal(actionForKey(e, { ...DEFAULT_HOTKEYS }), oldShortcut(e), 'a saved copy of the defaults');
    }
  });

  test('a rebound key: the new key acts, the old one is free; the character typed wins over the position', () => {
    assert.equal(actionForKey({ key: 'w', code: 'KeyW' }, rebound), 'retreat');
    assert.equal(actionForKey({ key: 'q', code: 'KeyQ' }, rebound), null);
    assert.equal(actionForKey({ key: 'ц', code: 'KeyW' }, rebound), 'retreat', 'a Russian layout: by position');
    assert.equal(actionForKey({ key: 'Process', code: 'KeyW' }, rebound), 'retreat', 'an IME: by position');
    // AZERTY: the player bound retreat to their A key (code KeyQ) and sell to their Q key (code KeyA)
    const azerty = { ...DEFAULT_HOTKEYS, retreat: 'KeyA', sell: 'KeyQ' };
    assert.equal(actionForKey({ key: 'a', code: 'KeyQ' }, azerty), 'retreat');
    assert.equal(actionForKey({ key: 'q', code: 'KeyA' }, azerty), 'sell');
    const swapped = rebindHotkey(DEFAULT_HOTKEYS, 'refresh', 'KeyF').keys;
    assert.equal(actionForKey({ key: 'f', code: 'KeyF' }, swapped), 'refresh');
    assert.equal(actionForKey({ key: 'r', code: 'KeyR' }, swapped), 'freeze');
    const named = { ...DEFAULT_HOTKEYS, sell: 'Delete', ready: 'KeyE', levelUp: 'Digit3', freeze: 'Comma' };
    assert.equal(actionForKey({ key: 'Delete', code: 'Delete' }, named), 'sell');
    assert.equal(actionForKey({ key: 'e', code: 'KeyE' }, named), 'ready');
    assert.equal(actionForKey({ key: ' ', code: 'Space' }, named), null, 'Space is free once ready moved');
    assert.equal(actionForKey({ key: '#', code: 'Digit3', shiftKey: true }, named), 'levelUp', 'Shift + 3: by position');
    assert.equal(actionForKey({ key: ',', code: 'KeyM' }, named), 'freeze', 'AZERTY comma: by the character');
    assert.equal(actionForKey({ key: 'w', code: 'KeyW' }, { retreat: 'KeyW', sell: 'KeyW' }), null, 'a corrupt map acts as the defaults');
  });

  test('shortcutFor with a rebound map keeps every guard: modifiers, text fields, repeats; Esc stays fixed', () => {
    const w = { key: 'w', code: 'KeyW' };
    assert.equal(shortcutFor(w, rebound), 'retreat');
    assert.equal(shortcutFor({ key: 'q', code: 'KeyQ' }, rebound), null);
    assert.equal(shortcutFor(w), null, 'W does nothing with the defaults');
    for (const mod of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(shortcutFor({ ...w, [mod]: true }, rebound), null, mod);
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) assert.equal(shortcutFor({ ...w, target: { tagName } }, rebound), null, tagName);
    assert.equal(shortcutFor({ ...w, target: { tagName: 'DIV', isContentEditable: true } }, rebound), null);
    assert.equal(shortcutFor({ ...w, repeat: true }, rebound), null);
    assert.equal(shortcutFor({ ...w, target: { tagName: 'BUTTON' } }, rebound), 'retreat', 'a focused HUD button does not stop it');
    assert.equal(shortcutFor({ key: 'Escape' }, rebound), 'escape');
    assert.equal(shortcutFor({ key: 'Escape', repeat: true }, { ...DEFAULT_HOTKEYS, ready: 'KeyE' }), 'escape');
    assert.equal(shortcutFor({ key: 'e', code: 'KeyE' }, { ...DEFAULT_HOTKEYS, ready: 'KeyE' }), 'ready', 'the ready key also pauses a solo battle (game.js)');
    // behind overlays the rebound actions are blocked like the defaults
    assert.equal(shortcutBlocked(shortcutFor(w, rebound), { drawer: true }), true);
    assert.equal(shortcutBlocked(shortcutFor(w, rebound), { modal: true }), true);
    assert.equal(shortcutBlocked(shortcutFor(w, rebound), {}), false);
  });

  test('the facing wheel swallows Space and every key of the map — the rebound one, not the old one', () => {
    for (const [key, code] of [[' ', 'Space'], ['r', 'KeyR'], ['f', 'KeyF'], ['d', 'KeyD'], ['q', 'KeyQ'], ['x', 'KeyX']]) {
      assert.equal(facingSwallows({ key, code }), true, code);
    }
    const g = { ...DEFAULT_HOTKEYS, refresh: 'KeyG' };
    assert.equal(facingSwallows({ key: 'g', code: 'KeyG' }, g), true);
    assert.equal(facingSwallows({ key: 'r', code: 'KeyR' }, g), false, 'R is free once refresh moved');
    assert.equal(facingSwallows({ key: ' ', code: 'Space' }, { ...DEFAULT_HOTKEYS, ready: 'KeyE' }), true, 'Space always: a focused button must not activate');
    assert.equal(facingSwallows({ key: 'z', code: 'KeyZ' }), false);
  });

  // GitHub #394 / PR #395: Enter followed the previewed direction whatever had the focus — Tab to 准备 / 设置 / ✕ and
  // Enter deployed. A tiny element tree whose closest() understands the selector forms facingEnter uses.
  const el = (tag, attrs = {}, parent = null) => {
    const self = {
      tagName: tag.toUpperCase(), attrs, parent,
      matches(sel) {
        return sel.split(',').map((s) => s.trim()).some((s) => {
          const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(s);
          if (!m) return false;
          if (m[1] && m[1].toUpperCase() !== self.tagName) return false;
          const classes = String(attrs.class || '').split(/\s+/);
          if (m[2] && !m[2].slice(1).split('.').every((c) => classes.includes(c))) return false;
          for (const [, k, v] of m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
            if (!(k in attrs) || (v !== undefined && String(attrs[k]) !== v)) return false;
          }
          return !!(m[1] || m[2] || m[3]);
        });
      },
      closest(sel) { for (let n = self; n; n = n.parent) if (n.matches(sel)) return n; return null; },
    };
    return self;
  };
  test('the facing wheel\'s Enter follows the focus: ✕ cancels, another control does nothing, elsewhere it commits', () => {
    const body = el('body');
    const wheel = el('div', { class: 'fwheel', role: 'dialog', tabindex: '-1' }, body);
    const cancel = el('button', { class: 'fwheel__cancel' }, el('div', { class: 'fwheel__dia' }, wheel));
    const cancelText = el('span', {}, cancel);
    const ready = el('button', { class: 'ready' }, el('header', {}, body));
    const gear = el('button', { class: 'gm__gear' }, body);
    const card = el('div', { role: 'button', tabindex: '0' }, body);
    const link = el('a', { href: '#' }, body);
    const field = el('input', { type: 'text' }, body);
    for (const chosen of [true, false]) {
      assert.equal(facingEnter({ key: 'Enter', target: cancel }, chosen), 'cancel', 'Enter on ✕ cancels (a direction previewed or not)');
      assert.equal(facingEnter({ key: 'Enter', target: cancelText }, chosen), 'cancel');
      for (const t of [ready, gear, card, link, field]) assert.equal(facingEnter({ key: 'Enter', target: t }, chosen), 'swallow', 'another control does nothing');
    }
    assert.equal(facingEnter({ key: 'Enter', target: wheel }, true), 'commit', 'the wheel has the focus when it opens: Enter confirms');
    assert.equal(facingEnter({ key: 'Enter', target: body }, true), 'commit');
    assert.equal(facingEnter({ key: 'Enter', target: null }, true), 'commit');
    assert.equal(facingEnter({ key: 'Enter', target: wheel }, false), 'swallow', 'nothing to confirm yet');
    assert.equal(facingEnter({ key: ' ', target: cancel }, true), null, 'not Enter: Space stays with facingSwallows');
    assert.equal(facingEnter({ key: 'ArrowUp', target: body }, true), null);
    assert.equal(facingEnter(null, true), null);
  });
  test('the wheel wires it: Enter through facingEnter, the wheel focusable and focused when it opens', () => {
    const src = read('public/js/ui/facingWheel.js');
    assert.match(src, /const enter = facingEnter\(e, !!L\.dir\);/);
    assert.doesNotMatch(src, /e\.key === 'Enter' && L\.dir/, 'no Enter that ignores the focus');
    assert.match(src, /<div ref=\$\{rootRef\} tabIndex="-1" class=\$\{cx\('fwheel'/);
    assert.match(src, /rootRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  });
});

describe('capturing a new key (the settings wait for a key)', () => {
  test('Esc cancels, Tab leaves, a lone modifier or a repeat is ignored', () => {
    assert.deepEqual(captureHotkey({ key: 'Escape', code: 'Escape' }), { kind: 'cancel' });
    assert.deepEqual(captureHotkey({ key: 'Tab', code: 'Tab', shiftKey: true }), { kind: 'leave' });
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']) assert.deepEqual(captureHotkey({ key, code: `${key}Left` }), { kind: 'ignore' }, key);
    assert.deepEqual(captureHotkey({ key: 'w', code: 'KeyW', repeat: true }), { kind: 'ignore' });
    assert.deepEqual(captureHotkey(null), { kind: 'ignore' });
  });

  test('a key held with Ctrl / Alt / ⌘ and the keys the interface keeps are refused, with the key named', () => {
    assert.deepEqual(captureHotkey({ key: 'k', code: 'KeyK', ctrlKey: true }), { kind: 'refuse', reason: 'modifier', name: 'K' });
    assert.deepEqual(captureHotkey({ key: '@', code: 'KeyQ', ctrlKey: true, altKey: true }), { kind: 'refuse', reason: 'modifier', name: '@' });
    assert.deepEqual(captureHotkey({ key: 'w', code: 'KeyW', metaKey: true }), { kind: 'refuse', reason: 'modifier', name: 'W' });
    for (const [key, code] of [['Enter', 'Enter'], ['ArrowUp', 'ArrowUp'], ['F5', 'F5'], ['Backspace', 'Backspace'], ['ContextMenu', 'ContextMenu']]) {
      assert.deepEqual(captureHotkey({ key, code }), { kind: 'refuse', reason: 'reserved', name: key }, key);
    }
  });

  test('the new key: the character typed (the keycap), else the physical key', () => {
    assert.deepEqual(captureHotkey({ key: 'w', code: 'KeyW' }), { kind: 'key', code: 'KeyW' });
    assert.deepEqual(captureHotkey({ key: 'W', code: 'KeyW', shiftKey: true }), { kind: 'key', code: 'KeyW' });
    assert.deepEqual(captureHotkey({ key: ' ', code: 'Space' }), { kind: 'key', code: 'Space' });
    assert.deepEqual(captureHotkey({ key: 'Delete', code: 'Delete' }), { kind: 'key', code: 'Delete' });
    assert.deepEqual(captureHotkey({ key: '1', code: 'Numpad1' }), { kind: 'key', code: 'Digit1' }, 'the numpad 1 types 1');
    assert.equal(hotkeyOf({ key: 'a', code: 'KeyQ' }), 'KeyA', 'AZERTY: the A keycap');
    assert.equal(hotkeyOf({ key: ',', code: 'KeyM' }), 'Comma', 'AZERTY: the comma keycap');
    assert.equal(hotkeyOf({ key: 'й', code: 'KeyQ' }), 'KeyQ', 'Russian: by position');
    assert.equal(hotkeyOf({ key: 'Process', code: 'KeyR' }), 'KeyR', 'an IME: by position');
    assert.equal(hotkeyOf({ key: '!', code: 'Digit1', shiftKey: true }), 'Digit1', 'Shift + 1: by position');
    assert.equal(hotkeyOf({ key: 'Enter', code: 'Enter' }), null);
    assert.equal(hotkeyOf({}), null);
  });
});

describe('every handler and key hint reads the map', () => {
  const files = [];
  const visit = (rel) => {
    for (const e of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) visit(r);
      else if (r.endsWith('.js')) files.push(r);
    }
  };
  visit('public/js');

  test('game.js and the facing wheel pass the player\'s map to the one lookup; no other file names a rebindable key', () => {
    assert.match(read('public/js/screens/game.js'), /shortcutFor\(e, settingsStore\.get\(\)\.keys\)/);
    assert.match(read('public/js/ui/facingWheel.js'), /facingSwallows\(e, settingsStore\.get\(\)\.keys\)/);
    for (const f of files) {
      if (f === 'public/js/ui/gameLogic/shortcuts.js') continue;
      const src = read(f);
      assert.doesNotMatch(src, /['"`]Key[RFDQX]['"`]|\^Key\[|code === 'Space'/, `${f}: a rebindable key hard-coded`);
      assert.doesNotMatch(src, /<kbd[^>]*>(R|F|D|Q|X|Space)<\/kbd>/, `${f}: a fixed key hint`);
      assert.doesNotMatch(src, /[（(]Space[）)]|[（(][QX][）)]|\[[QX]\]|· [RFD]'/, `${f}: a fixed key in a hint text`);
    }
  });

  test('the HUD hints follow the settings: hotkeyLabelOf and the ready button after a rebind', async () => {
    const { settingsStore, updateSettings, hotkeyLabelOf } = await import('../../public/js/ui/settings.js');
    const { ReadyToggle } = await import('../../public/js/ui/hud.js');
    after(() => updateSettings({ keys: DEFAULT_HOTKEYS }));
    const kbdOf = (v) => {
      const stack = [v];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) { stack.push(...n); continue; }
        if (!n || typeof n !== 'object') continue;
        if (n.type === 'kbd') return [n.props.children].flat().join('');
        stack.push(n.props?.children);
      }
      return null;
    };
    const priv = { ready: false, alive: true, temp: [], funds: 0 };
    assert.deepEqual(HOTKEY_ACTIONS.map(hotkeyLabelOf), ['R', 'F', 'D', 'Q', 'X', 'Space']);
    assert.equal(kbdOf(ReadyToggle({ priv, onToggle() {} })), 'Space');
    updateSettings({ keys: rebindHotkey(settingsStore.get().keys, 'ready', 'KeyE').keys });
    updateSettings({ keys: rebindHotkey(settingsStore.get().keys, 'retreat', 'KeyW').keys });
    assert.deepEqual(settingsStore.get().keys, { ...DEFAULT_HOTKEYS, ready: 'KeyE', retreat: 'KeyW' });
    assert.equal(hotkeyLabelOf('retreat'), 'W');
    assert.equal(kbdOf(ReadyToggle({ priv, onToggle() {} })), 'E');
    updateSettings({ keys: { retreat: 'Escape' } });
    assert.equal(hotkeyLabelOf('retreat'), 'Q', 'a bad patch falls back to the defaults');
    updateSettings({ keys: DEFAULT_HOTKEYS });
    assert.equal(kbdOf(ReadyToggle({ priv, onToggle() {} })), 'Space');
  });
});
