// (fork, GitHub #118) The public name in match records: a player may write a name into the records of their matches
// (server/match/records.js), so a clear (e.g. a high-Risk SPA-CC run) can be credited to them. Off by default: the
// name is sent with `hello` only while the switch is on and the name isn't empty (net.setPublicName), and records stay
// anonymous otherwise, as #32 designed them. Kept in this browser (sp.pref.profile.publicName).
import { createStore, loadPref, savePref } from '../store.js';
import { net } from '../net.js';
import { PUBLIC_NAME_MAX_LEN } from '../../../shared/constants.js';

const PREF = 'profile.publicName';

/** @param {unknown} v @returns {{ name: string, on: boolean }} */
export function parsePublicName(v) {
  const o = v && typeof v === 'object' ? /** @type {any} */ (v) : {};
  const name = typeof o.name === 'string' ? [...o.name].slice(0, PUBLIC_NAME_MAX_LEN).join('') : '';
  return { name, on: o.on === true };
}

/** What `hello` carries: the name while switched on, else null. @param {{ name: string, on: boolean }} p */
export const sentPublicName = (p) => (p.on && p.name.trim() ? p.name.trim() : null);

export const publicNameStore = createStore(parsePublicName(loadPref(PREF, null)));
const sync = () => net.setPublicName(sentPublicName(publicNameStore.get()));
sync();

/** @param {Partial<{ name: string, on: boolean }>} patch */
export function setPublicName(patch) {
  const next = parsePublicName({ ...publicNameStore.get(), ...patch });
  savePref(PREF, next);
  publicNameStore.set(next);
  sync();
}
