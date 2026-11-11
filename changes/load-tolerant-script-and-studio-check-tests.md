## 2026-11-11

### Script plugin and studio save tests no longer fail on a busy machine

- Behind the scenes: the script plugin integration tests now give the script setup probe the widest limit the setting
  allows (`SP_SCRIPT_PROBE_MS` 60 s, `test/helpers/wideScriptProbe.js`), because they test what the plugin does, not
  how fast its probe starts. Before, under load, the honest template plugin took over the server's 5 s and was killed.
  The server default stays 5 s, and `test/plugins/script-review.test.js` still checks it.
- The studio takes an optional `checkMs` (the checker's time budget for saves and checks, default the server's 20 s).
  The third presentation review tests set it to the studio tests' 180 s guard (`STUDIO_TRIAL_MS`). Before, a save runs
  two checks of 20 s each, and on a busy machine it answered 504 instead of the finding being tested.
