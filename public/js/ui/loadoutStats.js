// Shared operator stat preview used by roster loadout and DIY selection.
import { html, MicroLabel } from './components.js';
import { RichText } from './gameComponents.js';
import { chessStatsBlock, traitText, chessTalents } from './detailPanel.js';
import { chessLoadout } from './gameLogic.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';
const cx = (...parts) => parts.filter(Boolean).join(' ');
const getChessRec = (id) => data.lookup('chess', id);

/**
 * What 局内数值 shows (GitHub issue #64): the chess variant — the 精锐 record when asked for and the chess has one, else
 * the normal one — as the stored loadout makes it. chessLoadout (ui/gameLogic.js) resolves the skill and module the way
 * the in-match detail card and the sim do (shared/loadoutRecord.js): the elite's chosen module's stats / 特性 / talents
 * (不装备: the base ones), the chosen skill's passive range; a normal chess has no module, the skill does not change its
 * stats. Nothing is recomputed here.
 * @param {any} base normal chess record @param {any} golden its elite record or null
 * @param {Record<string, any>} entries the stored loadout @param {'normal'|'elite'} level
 * @param {(id: string) => any} getChess
 * @param {Record<string, any>|null} [ops] the stored 潜能 / 练度 (0.2.2: the numbers at the operator's settings — the
 *   练度 multiplier needs effects.json; none set = 潜能 6, 精英2 Lv.60)
 * @returns {{ elite: boolean, chess: any, lo: any, record: any, trait: string, talents: any[] } | null} null without a record
 */
export function statsPreview(base, golden, entries, level, getChess, ops = null) {
  const elite = level === 'elite' && !!golden;
  const chess = elite ? golden : base;
  if (!chess) return null;
  const lo = chessLoadout(chess, entries, getChess, { ops, effects: data.get('effects') });
  const record = lo?.record || chess;
  // (the card's own rule: the 特性 line exists when the chess has one; its text follows the chosen module)
  return { elite, chess, lo, record, trait: chess.trait?.desc ? traitText(chess, !!chess.isGolden, lo) || '' : '', talents: chessTalents(record) };
}

/**
 * 局内数值: the stats, 攻击范围, 特性 and 天赋 of the selected chess under its chosen skill and module — the detail
 * card's stats block (ui/detailPanel.js chessStatsBlock) without live numbers, so what a player reads here is what the
 * shop / board card shows before a battle (not the equipment, bond or skill-cast changes of a running match). The
 * toggle picks the 普通 or the 精锐 record; 精锐 is the default because the module only exists there.
 * @param {{ base: any, golden: any, entries: Record<string, any>, level: 'normal'|'elite', onLevel: (l: 'normal'|'elite') => void, getChess?: (id: string) => any }} props
 */
export function LoadoutStats({ base, golden, entries, level, onLevel, getChess = getChessRec, ops = null }) {
  const pv = statsPreview(base, golden, entries, level, getChess, ops);
  if (!pv) return null;
  // (the caption names 潜能 / 练度 when the numbers carry both — the 练度 multiplier needs effects.json)
  return html`<section class="lo-sec lo-sec--stats" aria-label=${t('局内数值')} data-variant=${pv.elite ? 'elite' : 'normal'}>
    <header class="lo-sec__head">
      <h3>${t('局内数值')}<${MicroLabel}>STATS<//></h3>
      <div class="lo-seg" role="tablist" aria-label=${t('数值版本')}>
        <button type="button" role="tab" aria-selected=${pv.elite ? 'false' : 'true'} class=${cx(!pv.elite && 'is-on')} data-variant="normal" onClick=${() => onLevel('normal')}>${t('普通')}</button>
        <button type="button" role="tab" aria-selected=${pv.elite ? 'true' : 'false'} class=${cx(pv.elite && 'is-on')} data-variant="elite" disabled=${!golden} onClick=${() => onLevel('elite')}>${t('精锐')}</button>
      </div>
    </header>
    ${chessStatsBlock({ rec: pv.record, chess: pv.chess })}
    ${pv.trait || pv.talents.length ? html`<div class="lo-minfo lo-minfo--kit">
      ${pv.trait ? html`<div class="lo-minfo__row"><span class="lo-minfo__k">${t('特性')}</span><${RichText} class="lo-minfo__v" text=${pv.trait} /></div>` : null}
      ${pv.talents.map((tal, i) => html`<div key=${i} class="lo-minfo__row"><span class="lo-minfo__k">${t('天赋')}</span>
        <span class="lo-minfo__v"><b class="lo-minfo__tname">${tal.name}</b><${RichText} text=${tal.descRaw || tal.desc || ''} /></span></div>`)}
    </div>` : null}
    <p class="lo-stats__cap">${pv.elite ? t('数值含所选模组；') : golden ? t('普通干员没有模组，所选模组在「精锐」中生效；') : ''}${pv.lo?.cultivation && data.get('effects') ? t('含潜能与练度；') : ''}${t('不含技能发动、装备、盟约等局内加成')}</p>
  </section>`;
}
