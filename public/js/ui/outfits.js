// 时装 / Outfits (fork feature, docs/OUTFITS.md): the player's outfit choice, its server sync and the resolvers the
// renderer, the 2D art and the voice read.
//
// `outfitStore.outfits` = `{ [charId]: skinId }` (shared/outfits.js), persisted in localStorage (`sp.pref.outfits`) like the
// loadout. Every player owns every outfit. A choice applies to the player's own units — the board, the bench, the shop
// cards, the 干员调配 rows and portraits, the battle — and to other players' screens through the server:
// `room.outfits { outfits }` after every welcome and edit (debounced; any phase — it is cosmetic, a running match shows
// it at once), and room.state `seats[].outfits` carries every seat's choice back.
//
// Resolvers (registered on import): ui/assetUrls.js setOutfitPicker (the own avatar / portrait), audio.js
// setOutfitVoiceResolver (a unit's outfit voice set), and outfitModelOf (render/units.js via ui/fieldHost.js: the model a
// unit wears). A unit's owner: `ownerId` (sim / scout UnitInfo); a piece without one is the player's own (the own prep
// board and bench). A 补位 stand-in is another operator (its own charId: no outfit of the replaced one); a 自选 piece is
// its pick's operator. Summons wear the look the owner's outfit gives them (data/outfits.json `tokens`).

import { createStore, loadPref, savePref, store } from '../store.js';
import { data } from '../data.js';
import { setOutfitPicker } from './assetUrls.js';
import { setOutfitVoiceResolver } from '../audio.js';
import { OUTFITS_PREF, cleanOutfits } from '../../../shared/outfits.js';

export const OUTFIT_SYNC_DEBOUNCE_MS = 500;
export const OUTFIT_RETRY_MS = 1500;

function readStored() {
  try { return cleanOutfits(loadPref(OUTFITS_PREF, null)?.outfits); } catch { return {}; }
}

/** The own choice + the outfit tab's state (`sync` ∈ idle | pending | sending | synced | error). */
export const outfitStore = createStore({ outfits: readStored(), sync: 'idle' });

/** Replace the own choice (persisted at once; the sync sends it). */
export function setOutfits(outfits) {
  const next = cleanOutfits(outfits);
  savePref(OUTFITS_PREF, { v: 1, outfits: next });
  outfitStore.set({ outfits: next });
}

/** Wear `skinId` on `charId` (null = its default look). */
export function setOutfit(charId, skinId) {
  const next = { ...outfitStore.get().outfits };
  if (skinId) next[charId] = skinId; else delete next[charId];
  setOutfits(next);
}

/**
 * Apply an imported choice (shared/outfits.js parseOutfitsImport), sanitised against data/outfits.json (loaded by the
 * caller): an outfit this build lacks is dropped. Replaces the whole choice (an empty import = every default look).
 * @returns {{ applied: number, dropped: number }}
 */
export function applyOutfitsImport(outfits, asked = Object.keys(outfits || {}).length) {
  const clean = cleanOutfits(outfits, data.get('outfits') || {});
  setOutfits(clean);
  const applied = Object.keys(clean).length;
  return { applied, dropped: Math.max(0, asked - applied) };
}

/** The outfits of `charId` in data/outfits.json, in the table's order ([] before it loads). */
export function outfitsOf(charId) {
  return (data.list('outfits') || []).filter((r) => r && r.charId === charId);
}

// ---- resolvers ----------------------------------------------------------------------------------------------

/** The choice of player `ownerId` (null / the own id → the own choice; another seat → its room.state outfits). */
export function choiceOf(ownerId) {
  const me = store.get().me?.playerId ?? null;
  if (ownerId == null || ownerId === me) return outfitStore.get().outfits;
  const seat = (store.get().room?.seats || []).find((s) => s && s.playerId === ownerId);
  return seat && seat.outfits && typeof seat.outfits === 'object' ? seat.outfits : {};
}

const outfitRecord = (skinId) => (skinId ? data.lookup('outfits', skinId) : null);

/**
 * The model id a unit wears (render/units.js `info.model`): the owner's outfit of an operator (its skinId), the look
 * that outfit gives a summon (a tokenSkinId), or null (the default look).
 * @param {{ kind?: string, side?: string, spine?: string, defId?: string, ownerId?: string|null }} info
 */
export function outfitModelOf(info) {
  if (!info || info.side === 'enemy') return null;
  const choice = choiceOf(info.ownerId);
  if (info.kind === 'token') {
    const tokenId = info.spine || info.defId;
    for (const skinId of Object.values(choice)) {
      const look = outfitRecord(skinId)?.tokens?.[tokenId];
      if (look) return look;
    }
    return null;
  }
  const charId = info.spine;
  return typeof charId === 'string' && choice[charId] ? choice[charId] : null;
}

/** The outfit voice set a unit / an operator speaks with (data/outfits.json `voice`), or null. */
export function outfitVoiceOf(u) {
  if (!u || (u.kind && u.kind !== 'op')) return null;
  const charId = u.charId || u.spine;
  const skinId = typeof charId === 'string' ? choiceOf(u.ownerId)[charId] : null;
  return outfitRecord(skinId)?.voice || null;
}

/**
 * The ui/assetUrls.js option that dresses `charId` as player `ownerId` does: undefined for the own units (null / the own
 * id: the own choice applies by itself), else `{ outfit: skinId | null }` (null = that player's default look).
 */
export function outfitOptsOf(charId, ownerId) {
  const me = store.get().me?.playerId ?? null;
  if (ownerId == null || ownerId === me) return undefined;
  return { outfit: (typeof charId === 'string' && choiceOf(ownerId)[charId]) || null };
}

setOutfitPicker((charId) => outfitStore.get().outfits[charId] || null);
setOutfitVoiceResolver(outfitVoiceOf);

// ---- server sync --------------------------------------------------------------------------------------------

/**
 * Keep the server's copy of the own choice current: `room.outfits { outfits }` after every welcome (a new or resumed
 * session) and every edit (debounced). Unlike the loadout it is never locked (cosmetic). Loads data/outfits.json for the
 * resolvers once the player is online (the summon looks and voice sets need it during a match).
 * @param {{ net: any, timers?: { setTimeout: Function, clearTimeout: Function }, target?: ReturnType<typeof createStore> }} deps
 */
export function installOutfitSync({ net, timers, target = outfitStore } = {}) {
  const T = timers || { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (id) => globalThis.clearTimeout(id) };
  let timer = null;
  let lastSent = null;
  let seq = 0;
  let disposed = false;
  const setState = (sync) => { if (target.get().sync !== sync) target.set({ sync }); };
  const schedule = (ms = OUTFIT_SYNC_DEBOUNCE_MS) => {
    if (disposed) return;
    T.clearTimeout(timer);
    setState('pending');
    timer = T.setTimeout(() => { timer = null; void flush(); }, ms);
  };
  async function flush() {
    if (disposed) return;
    if (net.status !== 'online') { setState('idle'); return; } // the next welcome resends
    const outfits = cleanOutfits(target.get().outfits);
    const json = JSON.stringify(outfits);
    if (json === lastSent) { setState('synced'); return; }
    const my = ++seq;
    setState('sending');
    try {
      await net.request('room.outfits', { outfits });
      if (my !== seq) return;
      lastSent = json;
      setState('synced');
    } catch (err) {
      if (my !== seq) return;
      const code = err && err.code;
      if (code === 'RATE' || code === 'TIMEOUT' || code === 'OFFLINE') schedule(OUTFIT_RETRY_MS);
      else { console.warn('[outfits] room.outfits refused', code, err && err.detail); setState('error'); }
    }
  }
  const offWelcome = net.on('welcome', () => { lastSent = null; seq++; data.load('outfits'); schedule(50); });
  const offStore = target.subscribe((s, prev) => { if (s.outfits !== prev.outfits) schedule(); });
  return {
    flush,
    dispose() { disposed = true; T.clearTimeout(timer); offWelcome?.(); offStore?.(); },
  };
}
