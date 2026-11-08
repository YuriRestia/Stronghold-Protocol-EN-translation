// Sandbox ↔ the game's UI (dev, fork; public/dev/sandbox-ui.js UnitCard): the one place the sandbox reaches into the
// match / 干员调配 / 时装 components, so a rework of those (the shared loadout card / drawer module) costs the sandbox this
// file only. Each export takes the sandbox's own state as props; nothing here reads or writes the player's saved loadout,
// Custom Squad or outfits.
//
//   ChessDetail  ui/detailPanel.js: the in-match operator card's sections (header, 特质 / garrison trait, 特性, stats with
//                the 攻击范围 普通 / 技能 switch, skill, module, equipment, talents) — the unit card is this card
//   SkillPick    a row of screens/loadoutSections.js SkillIcon: the skill choice (the card's own skill section shows it)
//   ModulePick   a row of loadoutSections.js ModuleGlyph (不装备 + the elite's modules; a 自选 prototype's locked one)
//   OutfitPane   screens/outfits.js OutfitCards (compact; 默认 + the operator's outfits) with the sandbox's per-unit pick
//   PiecePlates  ui/underframe.js Underframe: the match's 撤退 plate (board → bench) and 销毁 (removes the unit)
//   useTileScreen  ui/facingWheel.js: a board tile's place on screen, followed every frame (the card sits beside it)

import { html } from '../js/ui/components.js';
import { SkillIcon, ModuleGlyph } from '../js/screens/loadoutSections.js';
import { OutfitCards } from '../js/screens/outfits.js';
import { Underframe } from '../js/ui/underframe.js';
import { MODULE_NONE } from '../js/ui/loadoutModel.js';

export { ChessDetail } from '../js/ui/detailPanel.js';
export { Icon, MicroLabel } from '../js/ui/components.js';
export { MODULE_NONE, chessOptions } from '../js/ui/loadoutModel.js';
export { pickChoices, defaultPick } from '../js/ui/diyModel.js';
export { useTileScreen } from '../js/ui/facingWheel.js';

/**
 * The skill choice: the game's skill icons in a row, the chosen one outlined (its name, tags and text are the card's own
 * skill section).
 * @param {{ m: any, options: any[], skill: number|null, form: 'normal'|'elite', locked?: boolean, onPick: Function }} p
 */
export function SkillPick({ m, options, skill, form, locked = false, onPick }) {
  const recOf = (o) => (form === 'elite' ? o.elite || o.normal : o.normal || o.elite);
  return html`<div class="sbc__picks" role="radiogroup" aria-label="Skill">${options.map((o) => html`<button type="button" key=${o.index} role="radio"
      class="sbc__pick" aria-checked=${String(o.index === skill)} data-skill=${o.index} disabled=${locked}
      title=${`S${o.index + 1} ${recOf(o)?.name || ''}${o.isDefault ? ' (default)' : ''}`} onClick=${() => onPick(o.index)}>
    <${SkillIcon} m=${m} rec=${recOf(o)} index=${o.index} on=${o.index === skill} size="sm" /><span class="num">S${o.index + 1}</span>
  </button>`)}</div>`;
}

/**
 * The module choice: 不装备 and the module badges in a row, the chosen one outlined (the card's module section and its
 * stats show what it does).
 * @param {{ m: any, options: any[], module: string|null, locked?: boolean, onPick: Function }} p
 */
export function ModulePick({ m, options, module, locked = false, onPick }) {
  const list = [...options.filter((o) => o.id === MODULE_NONE), ...options.filter((o) => o.id !== MODULE_NONE)];
  const label = (o) => (o.id === MODULE_NONE ? 'None' : `${o.rec?.typeName || ''} ${o.rec?.name || o.id}`.trim());
  return html`<div class="sbc__picks" role="radiogroup" aria-label="Module">${list.map((o) => html`<button type="button" key=${o.id} role="radio"
      class="sbc__pick" aria-checked=${String(o.id === module)} data-module=${o.id} disabled=${locked}
      title=${`${label(o)}${o.isDefault ? ' (default)' : ''}`} onClick=${() => onPick(o.id)}>
    <${ModuleGlyph} m=${m} rec=${o.rec} id=${o.id} size="sm" /><span class="num">${o.id === MODULE_NONE ? 'None' : o.rec?.typeName || ''}</span>
  </button>`)}</div>`;
}

/** @param {{ m: any, charId: string, name: string, list: any[], worn: string|null, onPick: (id: string|null) => void }} p */
export function OutfitPane({ m, charId, name, list, worn, onPick }) {
  return html`<${OutfitCards} m=${m} charId=${charId} name=${name} list=${list} worn=${worn} compact=${true} onPick=${onPick} />`;
}

/** @param {{ view: any, uid: number, row: number, col: number, retreat: boolean, name: string, onRetreat: Function, onRemove: Function }} p */
export function PiecePlates({ view, uid, row, col, retreat, name, onRetreat, onRemove }) {
  return html`<${Underframe} key=${uid} view=${view} uid=${uid} row=${row} col=${col} name=${name}
    actions=${{ retreat, sell: null, destroy: true }} onRetreat=${onRetreat} onDestroy=${onRemove} />`;
}
