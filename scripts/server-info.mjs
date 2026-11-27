// Writes public/server-info.json (gitignored): the branch, commit and latest changes of this checkout, for the title
// screen's version line, "What's new" and "About this server" (public/js/ui/about.js). See server/serverInfo.js.
//
//   node scripts/server-info.mjs
//
// The server also writes it at every start. On the VPS it runs before every start too (systemd
// `ExecStartPre=-/usr/bin/node scripts/server-info.mjs`); after a `git pull` without a restart, run it by hand:
// cd /opt/stronghold/app && sudo -u stronghold node scripts/server-info.mjs
// Never fails the start: without git it writes nothing and the panels show "unknown".
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeServerInfo } from '../server/serverInfo.js';

writeServerInfo(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
