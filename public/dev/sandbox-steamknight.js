// public/dev/sandbox-steamknight.js — the Steam Knight slice's flag and panel values for the dev sandbox
// (crew-docs/steam-knight-slice-design.md). The flag is `&sk=1`; each value is `&sk-<key>=<number>`. Off, nothing is sent
// to the sim and the battle is the vanilla one. The numbers have NO official source: the START values below are only
// something to play with — the user sets them in the panel (they stay in the URL).

/**
 * THE start values: the one table of the numbers the user sets in the panel (no official source for any). The user said on
 * 2026-11-24 "just put a number that [you think] is good for now. Do let me edit it in the sim panel though" (relayed by the
 * lead). Clearing a field makes the sim refuse that part (no dash / no extra damage), never a hidden default.
 */
const START = Object.freeze({
  // [ASSUMED] dash speed 10 tiles/s: a 6-tile lane takes 0.6 s, readable on screen beside the official 1.5 s landing and 2.5 s blow clips; user OK 2026-11-24
  dashSpeed: 10,
  // [ASSUMED] blow damage 0.8 x ATK per tile boosted, on top of the official 3 hits at 1.25 ATK (3.75 x ATK): a 6-tile run adds 4.8 x ATK, so distance matters more than the base; user OK 2026-11-24
  dmgPerTile: 0.8,
  // [ASSUMED] side damage 1 x ATK to each normal enemy the boost passes: one ordinary hit of his; user OK 2026-11-24
  sideDamage: 1,
  // [ASSUMED] side shove 1.5 tiles: clears the lane without sending them off the road; user OK 2026-11-24
  shoveDist: 1.5,
  // [ASSUMED] push force 5 on the boost's target: the top of the official scale (特大力; Weedy's Liquid Nitrogen Cannon at mastery 3 is 3), so weight 0-2 goes 3.53 tiles, 3 → 2.96, 4 → 2.14, 5 → 1.7, 6 → 0.44; user OK 2026-11-24 ("come up with a push force number that feels satisfying")
  pushForce: 5,
  // [ASSUMED] push force 3 on every enemy the Zantetsuken hits, less than the boost's: weight 0 goes 3.53 tiles, 1 → 2.96, 2 → 2.14, 3 → 1.7, 4 → 0.44 (2 moved round 13's weight-4 enemies 0.12, unseen), 5 → 0.12 (PUSH_TILES); user OK 2026-11-25 ("a lesser amount. Probably let me tune that attack push force")
  zanPushForce: 3,
  // [ASSUMED] he blocks 1 enemy: the minimum that "he blocks" (user, 2026-11-24) can mean; the official enemy record has blockCnt 0; user OK 2026-11-24
  blockCnt: 1,
  // [src: official stmkgt_shield_01 shield__01: mesh general_ring_04 half width 0.9138 x scale 1.2212 = 1.116 tiles] the dome's edge
  blockDist: 1.12,
});

/** [key, label, unit, start value, step, hint]. */
const FIELDS = [
  ['dashSpeed', 'Dash speed', 'tiles/s', START.dashSpeed, 0.5, 'start value, you set it: how fast the pile bunker boosts along its lane'],
  ['dmgPerTile', 'Blow damage per tile boosted', '× ATK', START.dmgPerTile, 0.05, 'start value, you set it: added on top of the official 3 hits at 1.25 ATK'],
  ['sideDamage', 'Side damage', '× ATK', START.sideDamage, 0.05, 'start value, you set it: to each enemy the boost throws aside'],
  ['shoveDist', 'Side shove distance', 'tiles', START.shoveDist, 0.1, 'start value, you set it: how far an enemy is thrown aside'],
  ['pushForce', 'Push force on the boost hit', '', START.pushForce, 1, 'start value, you set it: the official force scale (-1 to 5); the distance is this less the enemy\'s weight, and bosses of a boss fight do not move'],
  ['zanPushForce', 'Push force on the Zantetsuken hit', '', START.zanPushForce, 1, 'start value, you set it: the same force scale as the boost\'s; empty = no push'],
  ['blockCnt', 'Enemies he blocks at once (and drags along)', '', START.blockCnt, 1, 'start value, you set it (the official enemy record has none)'],
  ['blockDist', 'Block distance along his lane', 'tiles', START.blockDist, 0.05, 'start value, the dome\'s edge, you set it: where he blocks and catches enemies; empty = the official 0.71'],
  // his stats (the user, 2026-11-24: "I would like to tune his stats"): these start at the OFFICIAL values
  // [src: official enemy_database enemy_1533_stmkgt level 0 attributes atk / maxHp / def / baseAttackTime]
  ['atk', 'ATK', '', 1600, 50, 'official value (enemy_database atk), yours to change', true],
  ['maxHp', 'Max HP', '', 65000, 1000, 'official value (enemy_database maxHp), yours to change', true],
  ['def', 'DEF', '', 2000, 50, 'official value (enemy_database def), yours to change', true],
  ['bat', 'Attack interval', 's', 5, 0.1, 'official value (enemy_database baseAttackTime); the Boost\'s +100 attack speed halves it', true],
];

/** Music picks: [value, label] (audio.js STEAM_KNIGHT_BGM). */
const BGM_START = 'J';   // the user's pick, 2026-11-25
const BGM = Object.freeze([['J', 'J · 14-10 mid-battle scene "fightback", straight to its loud part (default)'], ['I', 'I · the same with its intro'], ['C', 'C · 14-10 battle'],
  ['K', 'K · 14-10 story "frontline"'], ['L', 'L · 14-10 story "batmeeting"'], ['M', 'M · 14-10 story "newhope01"'],
  ['A', 'A · Chapter 13 battle 1, Victoria'], ['B', 'B · Chapter 13 battle 2, Victoria'],
  ['D', 'D · Hortus de Escapismo'], ['E', 'E · Zwillingstürme im Herbst'], ['F', 'F · Museum event'], ['G', 'G · Crisis Contract'], ['H', 'H · Near Light, Blood Knight'],
  ['2', 'his own second-phase theme'], ['1', 'his own first-phase theme'], ['3', 'Alistair'], ['0', "off: the round's own music"]]);

export const STEAM_KNIGHT_FIELDS = FIELDS;

/** The panel's state from the URL: { on, resist, values }. */
export function readSteamKnightQuery(q) {
  const values = {};
  for (const [k, , , start] of FIELDS) {
    const raw = q.get(`sk-${k}`);
    const n = raw == null || raw === '' ? NaN : Number(raw);
    values[k] = Number.isFinite(n) && n >= 0 ? n : start;
  }
  return { on: q.get('sk') === '1', resist: q.get('sk-resist') === '1', drag: q.get('sk-drag') !== '0', values };
}

/** Build the panel's inputs into `host` and return { cfg(), write(params) }. */
export function mountSteamKnightPanel(host, q, onChange, onMusic) {
  const st = readSteamKnightQuery(q);
  host.innerHTML = '';
  const mk = (tag, props = {}, kids = []) => {
    const el = document.createElement(tag);
    Object.assign(el, props);
    for (const k of kids) el.append(k);
    return el;
  };
  const on = mk('input', { type: 'checkbox', id: 'sk-on', checked: st.on });
  const resist = mk('input', { type: 'checkbox', id: 'sk-resist', checked: st.resist });
  const drag = mk('input', { type: 'checkbox', id: 'sk-drag', checked: st.drag });
  host.append(
    mk('label', { className: 'sb-check' }, [on, ' Steam Knight joins the Victoria bond (6 members: he drops onto Vina Victoria, then fights for you)']),
    mk('p', { className: 'sb-hint', textContent: 'Dev slice, sandbox only. Needs 6 Victoria on the board. Round 13: ?map=act1autochess_m03&enemies=hard-normal-r13. Every number below has no official source: the starting values are yours to change.' }),
  );
  const inputs = {};
  for (const [k, label, unit, , step, hint, official] of FIELDS) {
    const inp = mk('input', { type: 'number', min: 0, step, value: String(st.values[k]), className: 'sb-num', id: `sk-${k}` });
    inp.style.width = '5.5em';
    inputs[k] = inp;
    host.append(mk('label', { className: 'sb-check', title: hint }, [`${label} `, inp, unit ? ` ${unit}` : '', official ? ' (official, you can change it)' : ' (start value, you set it)']));
  }
  host.append(mk('label', { className: 'sb-check' }, [drag, ' The boost drags the enemies it runs into along, elites too, not what cannot be pushed (up to his block count); off: they are only shoved aside']));
  host.append(mk('label', { className: 'sb-check' }, [resist, " Second form's 30 % damage resistance (official reborn.damage_resistance), off by default"]));
  const music = mk('select', { id: 'sk-bgm' }, BGM.map(([v, label]) => mk('option', { value: v, textContent: label })));
  music.value = BGM.some(([v]) => v === q.get('sk-bgm')) ? q.get('sk-bgm') : BGM_START;
  host.append(mk('label', { className: 'sb-check' }, ['Music while he is on the field ', music]));
  // a pick while he is fighting changes the music at once
  music.addEventListener('change', () => onMusic?.());
  for (const el of [on, resist, drag, music, ...Object.values(inputs)]) el.addEventListener('change', () => onChange?.());
  return {
    /** The flag object for the BattleSpec (`spec.flags.steamKnight`), or null when off. */
    cfg() {
      if (!on.checked) return null;
      const out = { enabled: true, secondFormResist: resist.checked, drag: drag.checked };
      // a cleared field is left out (that part off: the sim reads a missing value as off; Number('') would be 0)
      for (const [k] of FIELDS) {
        const raw = String(inputs[k].value).trim();
        const n = Number(raw);
        if (raw !== '' && Number.isFinite(n) && n >= 0) out[k] = n;
      }
      return out;
    },
    /** The audio manager's BGM key of the picked music (audio.js STEAM_KNIGHT_BGM), or null: the round's own. */
    bgm() { return on.checked && music.value !== '0' ? `steamKnight:${music.value}` : null; },
    write(p) {
      if (on.checked && music.value !== BGM_START) p.set('sk-bgm', music.value); else p.delete('sk-bgm');
      if (on.checked) p.set('sk', '1'); else p.delete('sk');
      if (resist.checked) p.set('sk-resist', '1'); else p.delete('sk-resist');
      if (on.checked && !drag.checked) p.set('sk-drag', '0'); else p.delete('sk-drag');
      for (const [k, , , start] of FIELDS) {
        const n = Number(inputs[k].value);
        if (on.checked && Number.isFinite(n) && n !== start) p.set(`sk-${k}`, String(n)); else p.delete(`sk-${k}`);
      }
    },
  };
}
