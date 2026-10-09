// The briefing's 核心盟约 call (remake feature; server/match/bondCall.js, ui/bondCall.js): g.bondCall during INFO_CHECK
// sets / toggles / clears the player's call, m.public.players[].bondCall syncs it to every seat (INFO_CHECK only), only a
// core bond the mode activates is accepted; the client groups the callers per bond, marks P1–P4 or a red conflict and
// names them in the tooltip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { makeMatch, DATA } from './harness.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  let body;
  try { body = readFileSync(path.join(ROOT, 'data', String(url).split('/').pop()), 'utf8'); } catch { return { ok: false, status: 404, json: async () => ({}) }; }
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};

const { bondCallsOf, bondCallTip, BondCallMark, BondCallChip } = await import('../../public/js/ui/bondCall.js');
const { data } = await import('../../public/js/data.js');

const bonds = Object.entries(DATA.bonds);
const h0 = makeMatch({ mode: 'coop', humans: 1 });
const inactive = h0.m.gd.modeInactiveBonds;
h0.m.dispose();
const CORE = bonds.filter(([id, b]) => b.isCore && !inactive.has(id)).map(([id]) => id);
const ADDON = bonds.find(([, b]) => !b.isCore)?.[0];

test('protocol: g.bondCall { bondId? }', () => {
  assert.equal(validateC2S({ t: 'g.bondCall', bondId: CORE[0] }), null);
  assert.equal(validateC2S({ t: 'g.bondCall' }), null);
  assert.equal(validateC2S({ t: 'g.bondCall', bondId: null }), null);
  assert.notEqual(validateC2S({ t: 'g.bondCall', bondId: 5 }), null);
});

test('g.bondCall sets, toggles and clears the call; m.public carries it through the briefing and the strategy draft', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 2 }).start();
  const { m } = h;
  assert.equal(m.phase, PHASE.INFO_CHECK);
  const [a, b] = [...m.players.keys()];
  const view = (pid) => m.publicView().players.find((p) => p.playerId === pid);
  assert.equal('bondCall' in view(a), false, 'omitted while none');
  assert.deepEqual(m.handle(a, { t: 'g.bondCall', bondId: CORE[0] }), { ok: true });
  assert.deepEqual(m.handle(b, { t: 'g.bondCall', bondId: CORE[0] }), { ok: true });
  assert.equal(view(a).bondCall, CORE[0]);
  assert.equal(view(b).bondCall, CORE[0]);
  // another core bond replaces it; the same one again clears it; null clears it
  m.handle(a, { t: 'g.bondCall', bondId: CORE[1] });
  assert.equal(view(a).bondCall, CORE[1]);
  m.handle(a, { t: 'g.bondCall', bondId: CORE[1] });
  assert.equal('bondCall' in view(a), false);
  m.handle(b, { t: 'g.bondCall', bondId: null });
  assert.equal('bondCall' in view(b), false);
  // refused: an add-on bond, an unknown id, a bond the mode never activates
  if (ADDON) assert.equal(m.handle(a, { t: 'g.bondCall', bondId: ADDON }).error, ERR.BAD_TARGET);
  assert.equal(m.handle(a, { t: 'g.bondCall', bondId: 'noSuchShip' }).error, ERR.BAD_TARGET);
  const off = [...inactive].find((id) => DATA.bonds[id]?.isCore);
  if (off) assert.equal(m.handle(a, { t: 'g.bondCall', bondId: off }).error, ERR.BAD_TARGET);
  // after the briefing: refused, but still in m.public for the draft order (every seat sees every call)
  m.handle(a, { t: 'g.bondCall', bondId: CORE[0] });
  for (const ps of m.players.values()) m.handle(ps.playerId, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.notEqual(m.phase, PHASE.INFO_CHECK);
  assert.equal(m.handle(a, { t: 'g.bondCall', bondId: CORE[0] }).error, ERR.WRONG_PHASE);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.equal(view(a).bondCall, CORE[0]);
  m.dispose();
});

test('client: callers per bond by seat, the P1–P4 / conflict marker and the tooltip line', () => {
  const pub = { players: [
    { playerId: 'c', seat: 2, name: 'Cee', bondCall: 'x' },
    { playerId: 'a', seat: 0, name: 'Ay', bondCall: 'x' },
    { playerId: 'b', seat: 1, name: 'Bee', bondCall: 'y' },
    { playerId: 'd', seat: 3, name: 'Dee' },
  ] };
  const calls = bondCallsOf(pub);
  assert.deepEqual([...calls.keys()].sort(), ['x', 'y']);
  assert.deepEqual(calls.get('x').map((p) => p.playerId), ['a', 'c'], 'by seat');
  // one caller: its seat label, "mine" for the viewer
  const one = BondCallMark({ callers: calls.get('y'), myId: 'b' });
  assert.match(one.props.class, /\bis-mine\b/);
  assert.match(String(one.props.children).trim(), /^P2$/);
  assert.match(bondCallTip(calls.get('y')), /P2 Bee/);
  // two callers: red, no text, the tip names both
  const two = BondCallMark({ callers: calls.get('x'), myId: 'a' });
  assert.match(two.props.class, /\bis-conflict\b/);
  assert.doesNotMatch(two.props.class, /\bis-mine\b/);
  assert.equal(String(two.props.children ?? '').trim(), '');
  const tip = bondCallTip(calls.get('x'));
  assert.match(tip, /P1 Ay/);
  assert.match(tip, /P3 Cee/);
  assert.equal(BondCallMark({ callers: [] }), null);
  assert.equal(bondCallTip([]), '');
});

test('client: the draft order chip names the called bond (nothing for none / unknown)', async () => {
  await data.loadAll('bonds', 'assets');
  const chip = BondCallChip({ bondId: CORE[0] });
  assert.equal(chip.props['data-testid'], 'bond-call-chip');
  assert.ok(JSON.stringify(chip.props.children).includes(data.lookup('bonds', CORE[0]).name));
  assert.equal(BondCallChip({ bondId: null }), null);
  assert.equal(BondCallChip({ bondId: 'noSuchShip' }), null);
  // every row of the draft order renders its player's own call (not just the viewer's)
  const src = readFileSync(path.join(ROOT, 'public/js/screens/bandDraft.js'), 'utf8');
  assert.match(src, /<\$\{BondCallChip\} bondId=\$\{solo \? null : p\.bondCall\} \/>/);
});
