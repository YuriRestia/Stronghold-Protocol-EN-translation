// public/js/ui/regionNames.js — (fork) what a player reads for a server's region id (server/regions.js SP_REGIONS). A region
// without a name here shows its id in capitals, so a new server needs no client change to work.

import { N_, t } from '../../../shared/i18n.js';

const NAMES = {
  sg: N_('新加坡'), // en: "Singapore"
  us: N_('美国东部'), // en: "US East"
};

/** @param {string} id */
export function regionLabel(id) {
  return Object.hasOwn(NAMES, id) ? t(NAMES[id]) : String(id).toUpperCase();
}
