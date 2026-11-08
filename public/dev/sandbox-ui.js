// Sandbox overlay (dev, fork; public/dev/sandbox.js): the game's own match widgets over the sandbox field, and the icon
// pickers of the panel.
//
//   - the bond strip (ui/bondStrip.js BondStrip: discs, stacks, active state; dimmed on a boss field, whose battles gain
//     no stacks) and its popup (BondPopup: members on the board / bench, tiers, the effect at the current stacks);
//   - the detail card (ui/detailPanel.js DetailPanel) of whatever was clicked: an own piece in prep, any battle unit —
//     own operator, summon, enemy, boss — with the live HP and stats of the sandbox's battle;
//   - the battle meter (Meter): damage, healing, damage taken and stacks gained, per unit of the own side;
//   - OpPicker: every operator as an icon, grouped by bond (core bonds first, then the others, then the Custom Squad
//     picks); ItemPicker: every equipment as an icon, one group per item name (its normal and elite forms side by side);
//   - UnitCard: the clicked own unit in prep — the in-match operator card (ChessDetail) beside its piece, with the
//     sandbox's form, skill, starting SP, module, item and outfit choices slotted in (sandbox-loadout.js) — and the
//     match's 撤退 / 销毁 plates on its piece (PiecePlates). In battle a click opens the detail card as before.
// Everything here is presentational: sandbox.js owns the state and hands it in (renderOverlay).

import { render } from '../vendor/preact.module.js';
import { useEffect, useLayoutEffect, useRef, useState } from '../vendor/hooks.module.js';
import { html } from '../js/ui/components.js';
import { UnitThumb } from '../js/ui/gameComponents.js';
import { BondStrip, BondPopup } from '../js/ui/bondStrip.js';
import { DetailPanel } from '../js/ui/detailPanel.js';
import { bondIconUrl } from '../js/ui/assetUrls.js';
import { data } from '../js/data.js';
import { SettingsModal } from '../js/ui/settings.js';
import { ChessDetail, Icon, MicroLabel, SkillPick, ModulePick, OutfitPane, PiecePlates, useTileScreen } from './sandbox-loadout.js';
import { SP_FULL, cardPlace } from './sandbox-units.js';


const matches = (q, ...texts) => !q || texts.some((s) => String(s || '').toLowerCase().includes(q));

/** Icon groups filtered by `q`: `groups` [{ key, title, icon?, entries: [{ key, label, sub?, thumb }] }]. */
function IconGroups({ groups, q, onPick }) {
  const needle = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, entries: matches(needle, g.title) ? g.entries : g.entries.filter((e) => matches(needle, e.label, e.sub)) }))
    .filter((g) => g.entries.length);
  return shown.length ? shown.map((g) => html`<div class="sbp__group" key=${g.key}>
    <h3>${g.icon ? html`<img src=${g.icon} alt="" />` : null}<span>${g.title}</span><small>${g.entries.length}</small></h3>
    <div class="sbp__grid">${g.entries.map((e) => html`<button type="button" class="sbp__cell" key=${e.key} title=${e.sub ? `${e.label} · ${e.sub}` : e.label}
        aria-label=${e.sub ? `${e.label} · ${e.sub}` : e.label} onClick=${() => onPick(e)}>
      ${e.thumb}<span>${e.label}</span>${e.sub ? html`<small>${e.sub}</small>` : null}
    </button>`)}</div>
  </div>`) : html`<p class="sbp__hint">Nothing matches "${q}".</p>`;
}

/** A modal list of icon groups with a search box (IconGroups). */
function IconGrid({ title, hint, groups, onPick, onClose, placeholder }) {
  const [q, setQ] = useState('');
  return html`<div class="sbp-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section class="sbp brackets" role="dialog" aria-label=${title}>
      <header class="sbp__head">
        <h2>${title}</h2>
        <input type="search" placeholder=${placeholder} value=${q} onInput=${(e) => setQ(e.currentTarget.value)} aria-label="Filter" autofocus />
        <button type="button" onClick=${onClose}>Close</button>
      </header>
      ${hint ? html`<p class="sbp__hint">${hint}</p>` : null}
      <div class="sbp__body"><${IconGroups} groups=${groups} q=${q} onPick=${onPick} /></div>
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

/** A sandbox section of the card: the card's own section look (ui/detailPanel.js Section), marked SANDBOX. */
const SbSection = ({ title, testid = null, children }) => html`<section class="dsec sbc" data-testid=${testid}>
  <h4 class="dsec__title">${title}<${MicroLabel}>SANDBOX<//></h4>${children}</section>`;

/** Starting SP: the skill's own (Default), a number, or Full (sandbox-only: sandbox-units.js). */
function SpField({ sp, onSp }) {
  const full = sp.value === SP_FULL;
  if (sp.passive || !sp.cost) return html`<p class="sbc__note" data-testid="sb-sp">${sp.passive ? 'A passive skill: no SP to set.' : 'This skill costs no SP.'}</p>`;
  return html`<div class="sbc__row" data-testid="sb-sp">
    <span class="dstat__k">Starting SP</span>
    <div class="sbc__seg">
      <button type="button" class=${`sbc__btn${sp.value == null ? ' is-on' : ''}`} aria-pressed=${String(sp.value == null)} title=${`The skill's own: ${sp.init ?? 0}`} onClick=${() => onSp(null)}>Default</button>
      <button type="button" class=${`sbc__btn${full ? ' is-on' : ''}`} aria-pressed=${String(full)} onClick=${() => onSp(full ? null : SP_FULL)}>Full</button>
    </div>
    <input type="number" min="0" max=${sp.max ?? undefined} step="1" aria-label="Starting SP" class="sbc__num num"
      placeholder=${`${sp.init ?? 0}`} value=${Number.isInteger(sp.value) ? String(sp.value) : full ? String(sp.max ?? '') : ''}
      onChange=${(e) => { const v = e.currentTarget.value.trim(); onSp(v === '' ? null : Math.max(0, Math.floor(Number(v)) || 0)); }} />
    <span class="dstat__k num">/ ${sp.max ?? sp.cost}</span>
  </div>`;
}

/**
 * The skill hold of a unit (sandbox-units.js holdSkill): its skill forced on / off / left to the game, infinite SP,
 * infinite duration — and infinite HP (sandbox.js). `btn` = the button class (the card's .sbc__btn; the battle bar's own buttons: '').
 * @param {{ hold: { cast: 'on'|'off'|null, infSp: boolean, infDur: boolean, infHp: boolean }, onHold: (patch: object) => void, name?: string, btn?: string }} p
 */
export function HoldControls({ hold, onHold, name = '', btn = '' }) {
  const b = (on, label, title, patch) => html`<button type="button" class=${`${btn}${on && btn ? ' is-on' : ''}`} aria-pressed=${String(on)} title=${title}
    onClick=${() => onHold(patch)}>${label}</button>`;
  return html`<div class="sbh" data-testid="sb-hold">
    ${name ? html`<b class="sbh__name">${name}</b>` : null}
    <span class="sbh__k">Skill</span>
    <div class=${btn ? 'sbc__seg' : 'sbh__seg'} role="group" aria-label="Skill in battle">
      ${b(!hold.cast, 'Auto', 'The game decides when the skill starts', { cast: null })}
      ${b(hold.cast === 'on', 'On', 'Start the skill now and again whenever it ends', { cast: 'on' })}
      ${b(hold.cast === 'off', 'Off', 'End the skill and keep it from charging', { cast: 'off' })}
    </div>
    <div class=${btn ? 'sbc__seg' : 'sbh__seg'} role="group" aria-label="Infinite">
      ${b(hold.infSp, '∞ SP', 'The SP stays full', { infSp: !hold.infSp })}
      ${b(hold.infDur, '∞ Duration', 'A running skill never runs out', { infDur: !hold.infDur })}
      ${b(hold.infHp, '∞ HP', 'The HP stays full and the operator does not die', { infHp: !hold.infHp })}
    </div>
  </div>`;
}

/**
 * The own unit's card in prep: the in-match operator card (ui/detailPanel.js ChessDetail, its sizes and sections:
 * header, garrison trait, stats and range, skill, module, equipment, talents) beside the unit's piece, with the sandbox's
 * choices slotted in where they belong — the form under the header, the skill icons and starting SP above the skill, the
 * module badges above the module, an Add item button under the equipment, the outfits last. `d` = sandbox.js drawerModel;
 * `card` = { detail, loadout, bonds, offBonds } for ChessDetail; `on` = { form, skill, module, outfit, sp, addItem,
 * unequip, close }.
 */
export function UnitCard({ d, card, on }) {
  const g = useTileScreen(d.anchor?.view, d.anchor?.row, d.anchor?.col);
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => { const nw = ref.current?.offsetWidth || 0; if (nw && nw !== w) setW(nw); });
  const left = cardPlace(g, w || 400, 0, window.innerWidth, window.innerHeight).left;
  // another operator: the card starts at its top (the game's card does the same); a new outfit or form keeps the place
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [d.key]);
  const det = card.detail;
  let blocks = [];
  try {
    blocks = det?.type === 'chess' ? ChessDetail({ chess: det.chess, piece: det.piece, editable: false, bonds: card.bonds, offBonds: card.offBonds,
      loadout: card.loadout, diy: det.diy || null, ownerId: det.ownerId, onUnequip: on.unequip, onSell: () => {} }) || [] : [];
  } catch (e) { console.warn('[sandbox] card', e); }
  const at = (key) => blocks.findIndex((b) => b && b.key === key);
  const put = (key, node, after = false) => { const i = at(key); if (i >= 0) blocks.splice(after ? i + 1 : i, 0, node); else blocks.push(node); };
  const form = html`<div key="sb-form" class="sbc__row sbc__row--form">
    <span class="dstat__k">${d.where}</span>
    <div class="sbc__seg" role="group" aria-label="Form">${d.forms.map((f) => html`<button type="button" key=${f.key} class=${`sbc__btn${f.on ? ' is-on' : ''}`}
      aria-pressed=${String(f.on)} disabled=${f.disabled} onClick=${() => on.form(f.key)}>${f.label}</button>`)}</div>
  </div>`;
  const skill = html`<${SbSection} key="sb-skill" title="Skill choice" testid="sb-skill">
    <${SkillPick} m=${d.m} options=${d.skill.options} skill=${d.skill.on} form=${d.form} locked=${d.skill.locked} onPick=${on.skill} />
    ${d.skill.locked ? html`<p class="sbc__note">A prototype pick fights with its fixed skill (the Custom Squad rule).</p>` : null}
    <${SpField} sp=${d.sp} onSp=${on.sp} />
    <div class="sbc__row"><span class="dstat__k">In battle</span><${HoldControls} hold=${d.hold} onHold=${on.hold} btn="sbc__btn" /></div>
  <//>`;
  const module = html`<${SbSection} key="sb-module" title="Module choice" testid="sb-module">
    ${d.module.golden && d.module.options.length ? html`<${ModulePick} m=${d.m} options=${d.module.options} module=${d.module.on} locked=${d.module.locked} onPick=${on.module} />`
      : html`<p class="sbc__note">${d.module.empty}</p>`}
    ${d.module.note ? html`<p class="sbc__note">${d.module.note}</p>` : null}
  <//>`;
  const items = html`<div key="sb-items" class="sbc__row"><button type="button" class="sbc__add" data-testid="sb-add-item" onClick=${on.addItem}>
    ${d.items.length >= d.slots ? '+ Item (replaces the oldest)' : '+ Add item'}</button></div>`;
  const outfit = d.outfits.length ? html`<${SbSection} key="sb-outfit" title="Outfit" testid="sb-outfit">
    <${OutfitPane} m=${d.m} charId=${d.charId} name=${d.name} list=${d.outfits} worn=${d.outfit} onPick=${on.outfit} />
  <//>` : null;
  put('head', form, true);
  put('skill', skill);
  // (no module section — a normal form, an operator without modules: the choice sits before the equipment)
  if (at('module') >= 0) put('module', module); else put('equip', module);
  put('equip', items, true);
  if (outfit) put('talents', outfit, true);
  return html`<aside ref=${ref} class="dpanel brackets dpanel--chess sb-ucard" role="dialog" aria-label=${`${d.name} setup`} data-testid="sb-drawer"
      data-uid=${d.uid} style=${`left:${left}px`}>
    <button type="button" class="dpanel__close" aria-label="Close" onClick=${on.close}><${Icon} name="close" /></button>
    <div class="dpanel__scroll" ref=${scrollRef}>${blocks}</div>
  </aside>`;
}

/**
 * Render the overlay into `host`. `s` = { bonds: bondList entries, layersDisabled, bondOpen, priv, offBonds, detail,
 * snapHp, live, loadout (the card's { [baseId]: { skill, module } }: the unit's picks), picker: { kind: 'op', groups } |
 * { kind: 'item', groups, unitName } | null, drawer (UnitCard's `d`) with drawerOn, plates ({ view, uid, row, col,
 * retreat, name }: PiecePlates), on: { openBond, closeBond, member, closeDetail, pick, closePicker, retreat, remove } }.
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
    ${s.drawer ? html`<${UnitCard} d=${s.drawer} card=${{ detail: s.unitDetail, loadout: s.loadout || null, bonds: s.bonds, offBonds: s.offBonds }} on=${s.drawerOn} />` : null}
    ${s.plates ? html`<${PiecePlates} ...${s.plates} onRetreat=${s.on.retreat} onRemove=${s.on.remove} />` : null}
    ${s.settings ? html`<${SettingsModal} open=${true} onClose=${s.on.closeSettings} />` : null}
  `, host);
}
