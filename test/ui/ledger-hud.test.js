// The SPA-CC Blood Ledger on the HUD (ccFamiglia Unending / Seasonal): snapHud reads the snapshot's `bl`, and the top bar
// shows hud.js LedgerBar under itself while a battle is on screen — the event's wide thin gauge with no numbers, the
// Asset Liquidation claw on its centre (greyed until one starts) and the liquidating class while one lasts; nothing
// without a Ledger (#48).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHASE } from '../../shared/constants.js';

const { snapHud } = await import('../../public/js/ui/gameLogic.js');
const { PhaseCapsule, LedgerBar } = await import('../../public/js/ui/hud.js');

const textOf = (v) => {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return typeof v === 'object' ? textOf(v.props?.children) : '';
};
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}

test('snapHud reads the Ledger, and none without one', () => {
  assert.deepEqual(snapHud({ killed: 1, total: 5, bl: [250, 500, 0, 0] }).ledger, { value: 250, max: 500, liquidating: false, permanent: false });
  assert.deepEqual(snapHud({ bl: [500, 500, 1, 1] }).ledger, { value: 500, max: 500, liquidating: true, permanent: true });
  assert.ok(!('ledger' in snapHud({ killed: 1, total: 5 })), 'the HUD shape stays as before');
  assert.equal(snapHud({ bl: [1, 0, 0, 0] }).ledger, undefined, 'no max');
});

test('LedgerBar: the gauge with the claw on its centre, the liquidating class while one lasts', () => {
  const filling = LedgerBar({ ledger: { value: 312.6, max: 500, liquidating: false, permanent: false } });
  assert.ok(!filling.props.class.includes('is-liquidating'));
  assert.equal(textOf(filling).trim(), '', 'no numbers on the bar, as the event\'s gauge');
  assert.equal(filling.props['aria-valuenow'], 312);
  assert.equal(filling.props['aria-valuetext'], '312/500', 'the count stays for screen readers');
  const fill = [...walk(filling)].find((v) => v.props?.class === 'ledger__fill');
  assert.ok(fill.props.style.includes('62.5'), fill.props.style);
  assert.ok([...walk(filling)].some((v) => v.props?.class === 'ledger__mark'), '#48: the claw mark is there while it fills');
  assert.ok(![...walk(filling)].some((v) => v.props?.name === 'blood_icon'), 'not the overtime drain\'s blood drop');
  const on = LedgerBar({ ledger: { value: 200, max: 500, liquidating: true, permanent: false } });
  assert.ok(on.props.class.includes('is-liquidating'));
  assert.ok([...walk(on)].some((v) => v.props?.class === 'ledger__mark'));
  assert.equal(on.props['aria-valuetext'], '清算时刻');
  assert.equal(LedgerBar({ ledger: null }), null);
});

test('the top bar carries it while a battle is on screen, out of the phase capsule', () => {
  const hud = { killed: 2, total: 9, ledger: { value: 100, max: 500, liquidating: false, permanent: false } };
  for (const phase of [PHASE.COMBAT, PHASE.FINAL_ASSAULT]) {
    const cap = PhaseCapsule({ pub: { phase }, hud });
    assert.ok(![...walk(cap)].some((v) => v.type === LedgerBar), phase);
  }
  const src = readFileSync(new URL('../../public/js/ui/hud.js', import.meta.url), 'utf8');
  const top = src.slice(src.indexOf('export function TopBar'));
  assert.match(top, /const fighting = boss \|\| isCombatPhase\(phase\) \|\| \(phase === PHASE\.SETTLE && hud\?\.total != null\)/);
  assert.match(top, /\$\{fighting \? html`<\$\{LedgerBar\} ledger=\$\{hud\?\.ledger\} \/>` : null\}/);
  const css = readFileSync(new URL('../../public/css/screens/game.css', import.meta.url), 'utf8');
  assert.match(css, /\.ledger\.is-liquidating \.ledger__mark \{[^}]*animation: ledger-pulse [^}]* 1;/, 'the mark pulses once');
});
