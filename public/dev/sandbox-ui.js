// Sandbox overlay (dev, fork; public/dev/sandbox.js): the game's own match widgets over the sandbox field, and the icon
// pickers of the panel.
//
//   - the bond strip (ui/bondStrip.js BondStrip: discs, stacks, active state; dimmed on a boss field, whose battles gain
//     no stacks) and its popup (BondPopup: members on the board / bench, tiers, the effect at the current stacks);
//   - the detail card (ui/detailPanel.js DetailPanel) of whatever was clicked: an own piece in prep, any battle unit —
//     own operator, summon, enemy, boss — with the live HP and stats of the sandbox's battle;
//   - the battle meter (Meter): damage, healing, damage taken and stacks gained, per unit of the own side;
//   - OpPicker: every operator as an icon, grouped by bond (core bonds first, then the others, then the Custom Squad
//     picks); ItemPicker: every equipment as an icon, one group per item name (its normal and elite forms side by side).
// Everything here is presentational: sandbox.js owns the state and hands it in (renderOverlay).

import { render } from '../vendor/preact.module.js';
import { useState } from '../vendor/hooks.module.js';
import { html } from '../js/ui/components.js';
import { UnitThumb } from '../js/ui/gameComponents.js';
import { BondStrip, BondPopup } from '../js/ui/bondStrip.js';
import { DetailPanel } from '../js/ui/detailPanel.js';
import { bondIconUrl } from '../js/ui/assetUrls.js';
import { data } from '../js/data.js';
import { SettingsModal } from '../js/ui/settings.js';

const matches = (q, ...texts) => !q || texts.some((s) => String(s || '').toLowerCase().includes(q));

/** A modal list of icon groups with a search box: `groups` [{ key, title, icon?, entries: [{ key, label, sub?, thumb }] }]. */
function IconGrid({ title, hint, groups, onPick, onClose, placeholder }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, entries: matches(needle, g.title) ? g.entries : g.entries.filter((e) => matches(needle, e.label, e.sub)) }))
    .filter((g) => g.entries.length);
  return html`<div class="sbp-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section class="sbp brackets" role="dialog" aria-label=${title}>
      <header class="sbp__head">
        <h2>${title}</h2>
        <input type="search" placeholder=${placeholder} value=${q} onInput=${(e) => setQ(e.currentTarget.value)} aria-label="Filter" autofocus />
        <button type="button" onClick=${onClose}>Close</button>
      </header>
      ${hint ? html`<p class="sbp__hint">${hint}</p>` : null}
      <div class="sbp__body">
        ${shown.length ? shown.map((g) => html`<div class="sbp__group" key=${g.key}>
          <h3>${g.icon ? html`<img src=${g.icon} alt="" />` : null}<span>${g.title}</span><small>${g.entries.length}</small></h3>
          <div class="sbp__grid">${g.entries.map((e) => html`<button type="button" class="sbp__cell" key=${e.key} title=${e.sub ? `${e.label} · ${e.sub}` : e.label}
              aria-label=${e.sub ? `${e.label} · ${e.sub}` : e.label} onClick=${() => onPick(e)}>
            ${e.thumb}<span>${e.label}</span>${e.sub ? html`<small>${e.sub}</small>` : null}
          </button>`)}</div>
        </div>`) : html`<p class="sbp__hint">Nothing matches "${q}".</p>`}
      </div>
    </section>
  </div>`;
}

/**
 * Operator groups by bond for OpPicker. `pool` = the sandbox picker's entries ({ chess } | { charId, tiers, rec }), each
 * with its `label`; a chess sits in every bond it carries; Custom Squad picks get their own group.
 */
export function operatorGroups(pool, bondIds) {
  const m = data.get('assets');
  const name = (id) => data.lookup('bonds', id)?.appellation || data.lookup('bonds', id)?.name || id;
  const core = bondIds.filter((id) => data.lookup('bonds', id)?.isCore);
  const order = [...core, ...bondIds.filter((id) => !core.includes(id))];
  const entry = (p) => ({ key: p.label, label: p.name, sub: p.chess ? `T${p.chess.tier}` : `Custom T${p.tiers.join('/')}`, pick: p,
    thumb: html`<${UnitThumb} kind="chess" id=${p.chess?.chessId} rec=${p.chess ? null : p.rec} size="sm" />` });
  const normal = pool.filter((p) => p.chess && !p.chess.isGolden).sort((a, b) => a.chess.tier - b.chess.tier || a.name.localeCompare(b.name));
  const groups = order.map((id) => ({ key: id, title: `${name(id)}${core.includes(id) ? '' : ' (bond)'}`, icon: bondIconUrl(m, id),
    entries: normal.filter((p) => p.chess.bonds?.includes(id)).map(entry) })).filter((g) => g.entries.length);
  const diy = pool.filter((p) => !p.chess);
  if (diy.length) groups.push({ key: 'diy', title: 'Custom Squad picks', entries: diy.map(entry) });
  return groups;
}

/** Item groups for ItemPicker: one per item name, alphabetical; its forms in tier order (normal, then elite). */
export function itemGroups(items) {
  const byName = new Map();
  for (const r of items) {
    const k = r.name || r.id;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(r);
  }
  return [...byName].sort(([a], [b]) => a.localeCompare(b)).map(([title, list]) => ({
    key: title, title,
    entries: list.sort((a, b) => Number(!!a.isGolden) - Number(!!b.isGolden) || a.tier - b.tier).map((r) => ({
      key: r.id, label: r.isGolden ? 'Elite' : 'Normal', sub: `T${r.tier ?? '?'}`, pick: r,
      thumb: html`<${UnitThumb} kind="item" id=${r.id} size="sm" />`,
    })),
  }));
}

/** The battle meter's tabs: [key, tab label, the total's label]. */
export const METER_TABS = Object.freeze([['dmg', 'Damage', 'damage dealt'], ['heal', 'Healing', 'healing done'], ['stacks', 'Stacks', 'stacks gained'], ['taken', 'Taken', 'damage taken']]);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/**
 * The battle meter: per unit of the own side, the sim's own counters (unit.stats dmg / heal / taken; a summon counts for
 * its operator) and the stacks it gained, bars most first, the match's .dmg__ bar styles. `m` = { title, rows: [{ key,
 * kind, defId, rec, name, dmg, heal, taken, stacks, bonds: { [bondId]: n } }], other: [{ key, label, stacks, bonds }]
 * (gains without a unit: bond effects, items, strategies …), byBond: [{ bondId, n }], totals }.
 */
function Meter({ m, tab, onTab, onClose, bondName }) {
  const [, label, totalLabel] = METER_TABS.find(([k]) => k === tab) || METER_TABS[0];
  const bondsText = (b) => Object.entries(b || {}).map(([id, n]) => `${bondName(id)} +${n}`).join(', ');
  const rows = m.rows.filter((r) => r[tab] > 0).sort((a, b) => b[tab] - a[tab] || (a.key < b.key ? -1 : 1));
  const other = tab === 'stacks' ? m.other.filter((r) => r.stacks > 0).sort((a, b) => b.stacks - a.stacks) : [];
  const max = [...rows, ...other].reduce((x, r) => Math.max(x, r[tab]), 0);
  const bar = (v) => html`<span class="dmg__track" aria-hidden="true"><span class="dmg__bar" style=${`width:${max > 0 ? (v / max) * 100 : 0}%`}></span></span>`;
  return html`<section class="sb-meter brackets" aria-label="Battle meter">
    <header class="sb-meter__head">
      <b>Battle meter</b><small>${m.title}</small>
      <button type="button" class="sb-meter__x" aria-label="Hide the battle meter" onClick=${onClose}>✕</button>
    </header>
    <div class="sb-meter__tabs" role="tablist">${METER_TABS.map(([k, l]) => html`<button type="button" role="tab" key=${k} aria-selected=${String(tab === k)}
      onClick=${() => onTab(k)}>${l}</button>`)}</div>
    <div class="sb-meter__total"><span>Total ${totalLabel}</span><b class="num">${fmt(m.totals[tab])}</b></div>
    <ol class="dmg__list">
      ${rows.map((r) => {
        const name = tab === 'stacks' ? `${r.name} · ${bondsText(r.bonds)}` : r.name;
        return html`<li key=${r.key} class="dmg__row" title=${name}>
          <${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${r.defId} rec=${r.rec} size="xs" showTier=${false} />
          <span class="dmg__name">${name}</span>${bar(r[tab])}<b class="dmg__num num">${fmt(r[tab])}</b>
        </li>`;
      })}
      ${other.map((r) => html`<li key=${r.key} class="dmg__row" title=${`${r.label} · ${bondsText(r.bonds)}`}>
        <span class="sb-meter__glyph" aria-hidden="true">◆</span>
        <span class="dmg__name">${r.label} · ${bondsText(r.bonds)}</span>${bar(r.stacks)}<b class="dmg__num num">${fmt(r.stacks)}</b>
      </li>`)}
    </ol>
    ${!rows.length && !other.length ? html`<p class="sb-meter__empty">${m.rows.length ? `No ${label.toLowerCase()} yet.` : 'Start a battle: the meter fills as it runs.'}</p>` : null}
    ${tab === 'stacks' && m.byBond.length ? html`<p class="sb-meter__bonds">By bond: ${m.byBond.map((b) => `${bondName(b.bondId)} +${b.n}`).join(' · ')}</p>` : null}
    ${tab === 'stacks' && m.noGains ? html`<p class="sb-meter__bonds">${m.noGains}</p>` : null}
  </section>`;
}

/**
 * Render the overlay into `host`. `s` = { bonds: bondList entries, layersDisabled, bondOpen, priv, offBonds, detail,
 * snapHp, live, loadout (the card's { [baseId]: { skill } }: the unit's picked skill), picker: { kind: 'op', groups } | { kind: 'item', groups, unitName } | null, on: { openBond, closeBond,
 * member, closeDetail, pick, closePicker } }.
 */
export function renderOverlay(host, s) {
  const entry = s.bondOpen ? s.bonds.find((b) => b.bondId === s.bondOpen) || null : null;
  render(html`
    <div class="sb-strip">
      <${BondStrip} bonds=${s.bonds} layersDisabled=${s.layersDisabled} openId=${s.bondOpen} onOpen=${s.on.openBond} />
    </div>
    ${s.bondOpen ? html`<${BondPopup} bondId=${s.bondOpen} entry=${entry} priv=${s.priv} off=${!!entry?.off} place="right"
      onClose=${s.on.closeBond} onMember=${s.on.member} />` : null}
    ${s.detail ? html`<${DetailPanel} detail=${s.detail} snapHp=${s.snapHp} editable=${false} onClose=${s.on.closeDetail} onSell=${() => {}}
      onDestroy=${() => {}} bonds=${s.bonds} offBonds=${s.offBonds} side="right" live=${s.live} loadout=${s.loadout || null} voice=${true} onBond=${s.on.openBond} />` : null}
    ${s.meter ? html`<${Meter} m=${s.meter} tab=${s.meterTab} onTab=${s.on.meterTab} onClose=${s.on.closeMeter}
      bondName=${(id) => data.lookup('bonds', id)?.appellation || data.lookup('bonds', id)?.name || id} />` : null}
    ${s.picker?.kind === 'op' ? html`<${IconGrid} title="Pick an operator" placeholder="Filter by name or bond" groups=${s.picker.groups}
      hint="Grouped by bond: an operator with two bonds is in both. The pick goes into the operator picker (choose its form, skill and outfit there)."
      onPick=${s.on.pick} onClose=${s.on.closePicker} />` : null}
    ${s.picker?.kind === 'item' ? html`<${IconGrid} title=${`Equip an item on ${s.picker.unitName}`} placeholder="Filter by item name"
      groups=${s.picker.groups} hint="A unit carries two items: a third replaces the oldest."
      onPick=${s.on.pick} onClose=${s.on.closePicker} />` : null}
    ${s.settings ? html`<${SettingsModal} open=${true} onClose=${s.on.closeSettings} />` : null}
  `, host);
}
