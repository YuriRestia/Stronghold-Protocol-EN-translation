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
  // [ASSUMED] wait for an elite or boss in the lane 5 s: as long as the official stance clip; user OK 2026-11-24
  waitLimit: 5,
  // [ASSUMED] he blocks 1 enemy: the minimum that "he blocks" (user, 2026-11-24) can mean; the official enemy record has blockCnt 0; user OK 2026-11-24
  blockCnt: 1,
});

/** [key, label, unit, start value, step, hint]. */
const FIELDS = [
  ['dashSpeed', 'Dash speed', 'tiles/s', START.dashSpeed, 0.5, 'start value, you set it: how fast the pile bunker boosts along its lane'],
  ['dmgPerTile', 'Blow damage per tile boosted', '× ATK', START.dmgPerTile, 0.05, 'start value, you set it: added on top of the official 3 hits at 1.25 ATK'],
  ['sideDamage', 'Side damage', '× ATK', START.sideDamage, 0.05, 'start value, you set it: to each normal enemy the boost passes'],
  ['shoveDist', 'Side shove distance', 'tiles', START.shoveDist, 0.1, 'start value, you set it: how far a normal enemy is thrown aside'],
  ['waitLimit', 'Wait for an elite or boss in the lane', 's', START.waitLimit, 0.5, 'start value, you set it: then the normal enemy with the most HP is the target'],
  ['blockCnt', 'Enemies he blocks at once', '', START.blockCnt, 1, 'start value, you set it (the official enemy record has none)'],
  // his stats (the user, 2026-11-24: "I would like to tune his stats"): these start at the OFFICIAL values
  // [src: official enemy_database enemy_1533_stmkgt level 0 attributes atk / maxHp / def / baseAttackTime]
  ['atk', 'ATK', '', 1600, 50, 'official value (enemy_database atk), yours to change', true],
  ['maxHp', 'Max HP', '', 65000, 1000, 'official value (enemy_database maxHp), yours to change', true],
  ['def', 'DEF', '', 2000, 50, 'official value (enemy_database def), yours to change', true],
  ['bat', 'Attack interval', 's', 5, 0.1, 'official value (enemy_database baseAttackTime); the Boost\'s +100 attack speed halves it', true],
];

export const STEAM_KNIGHT_FIELDS = FIELDS;

/** The panel's state from the URL: { on, resist, values }. */
export function readSteamKnightQuery(q) {
  const values = {};
  for (const [k, , , start] of FIELDS) {
    const raw = q.get(`sk-${k}`);
    const n = raw == null || raw === '' ? NaN : Number(raw);
    values[k] = Number.isFinite(n) && n >= 0 ? n : start;
  }
  return { on: q.get('sk') === '1', resist: q.get('sk-resist') === '1', values };
}

/** Build the panel's inputs into `host` and return { cfg(), write(params) }. */
export function mountSteamKnightPanel(host, q, onChange) {
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
  host.append(mk('label', { className: 'sb-check' }, [resist, " Second form's 30 % damage resistance (official reborn.damage_resistance), off by default"]));
  for (const el of [on, resist, ...Object.values(inputs)]) el.addEventListener('change', () => onChange?.());
  return {
    /** The flag object for the BattleSpec (`spec.flags.steamKnight`), or null when off. */
    cfg() {
      if (!on.checked) return null;
      const out = { enabled: true, secondFormResist: resist.checked };
      // a cleared field is left out (that part off: the sim reads a missing value as off; Number('') would be 0)
      for (const [k] of FIELDS) {
        const raw = String(inputs[k].value).trim();
        const n = Number(raw);
        if (raw !== '' && Number.isFinite(n) && n >= 0) out[k] = n;
      }
      return out;
    },
    write(p) {
      if (on.checked) p.set('sk', '1'); else p.delete('sk');
      if (resist.checked) p.set('sk-resist', '1'); else p.delete('sk-resist');
      for (const [k, , , start] of FIELDS) {
        const n = Number(inputs[k].value);
        if (on.checked && Number.isFinite(n) && n !== start) p.set(`sk-${k}`, String(n)); else p.delete(`sk-${k}`);
      }
    },
  };
}
