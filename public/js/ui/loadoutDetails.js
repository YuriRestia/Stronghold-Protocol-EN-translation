// (fork) 干员调配's 「详情」 on or off (screens/loadout.js DetailsToggle, slideDetails): the skills' descriptions and every
// module beside each card, in the card view and on the 自选编队 picker page (screens/diy.js) alike. A store of its own:
// the toggle redraws only its button and switches the deck's class in place, and a deck's own redraws read it here so
// the class stays. Kept in this browser (loadPref 'loadout.details'). Its own module so the picker reads it without
// importing the loadout screen (which imports the picker).
import { createStore, loadPref } from '../store.js';

export const DETAILS_PREF = 'loadout.details';
/** The stored choice: off unless this browser turned it on. */
export const loadoutDetailsPref = () => loadPref(DETAILS_PREF, false) === true;
/** `{ on }`: the current 「详情」. */
export const detailsStore = createStore({ on: loadoutDetailsPref() });

/**
 * (fork) 时装 view (the user's call of 2026-11-09): the cards' columns show each operator's outfits — its portrait icons —
 * in place of the skill / module buttons (screens/loadoutDeck.js OutfitSide, OutfitToggle). Kept in this browser.
 */
export const OUTFIT_VIEW_PREF = 'loadout.outfitview';
export const outfitViewStore = createStore({ on: loadPref(OUTFIT_VIEW_PREF, false) === true });
