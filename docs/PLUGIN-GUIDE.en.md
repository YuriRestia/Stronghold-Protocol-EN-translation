# Plugin beginner's guide: from swapping a portrait to gameplay plugins

> English translation of [PLUGIN-GUIDE.md](PLUGIN-GUIDE.md). The Chinese original is the authoritative version. Game terms follow the official EN client, and studio labels follow the in-game English UI (`public/i18n/en.json`).

This guide is for players who **can't write code and don't want to touch the command line**: with the "Plugin studio" in your browser, in a few minutes you can swap an operator's portrait for one you drew yourself,
preview it side by side with the original, and pack it into a zip to send to friends. Further on are the steps for new operators, the DSL, Try a battle, scripts, installing and bulk deletion. For those comfortable with the command line, part two shows the command-line way to do the same things. The full format reference is
[PLUGINS.md](PLUGINS.md) (English, §9 cosmetic plugins, §15 the studio and the tools); to have an AI help you make a plugin, ask it to read `plugins/AGENTS.md` first.

> Cosmetic plugins only change what you see and hear (avatars, portraits, models, icons, voice lines, sound effects, music) and **change no numbers and no matches**: a match with cosmetic plugins on is still a vanilla match.
> **Don't put files of the official game into a plugin.** Use what you drew or recorded yourself, or "borrow" art this installation already has (see below).

## What you need

- A computer running the game server (`npm start` on your own computer, or double-click the start script in the release package).
- A browser (Chrome, Edge, Firefox or Safari all work).
- Your own pictures: for portraits, PNG or WebP of about 1024 × 1024 is recommended, with the character centered and toward the top; avatars are 180 × 180.

Plugins live in the server's `plugins/` folder, one folder per plugin, and the folder name is the plugin's **id**.

## Way one: the Plugin studio (no code)

### 1. Open the studio

Once the server starts, its window shows an extra **`Studio:`** line followed by the studio's address, like `http://localhost:3000/studio/#key=…`.
Open it (or copy it into the browser). What follows `#key=` is the **studio key**: you need it to create or change plugins. The browser remembers the key, so afterwards you can simply open
`http://localhost:3000/studio/`. For other computers on the same LAN: replace `localhost` in the address with the server's LAN address (the
`LAN:` line in the window). If the studio you open shows a "View only" notice at the top, this browser doesn't have the key yet: paste the address from the `Studio:` line
into it and press "Use". The key is also stored in the server's `plugins/.studio-key` file; delete that file and restart the server to get a new key.

The studio is **open only to this computer and the LAN**: anyone reaching it from the internet just sees "page not found". If you expose the server to the internet with **TCP-style tunnelling** (frp tcp
tunnels, `ssh -R`, ngrok tcp and the like), connections from the internet look to the server as if they came from this computer. Then others still can't change your
plugins without the key, but they can see the plugins in the studio; if you don't want them seen, start the server with `SP_STUDIO=off` (turns the studio off).

(Screenshot here: the studio's home page, with the plugin list and the "New plugin" button on the left and the four-step instructions on the right. See "Where the screenshots come from" at the end for how to make it; file name `studio-start.png`.)

### 2. Create a plugin and pick a template

Press **"New plugin"** at the top left and pick the template **"Avatar / portrait / icon"**. The other cosmetic templates are "Spine model", "Voice lines" and "Music / sounds"; the gameplay and interface templates are covered in later sections.

(Screenshot here: the template list of New plugin. `studio-templates.png`)

### 3. Find the operator to replace by its official name

Type the operator's **official name** into the search box, for example "Texas", and click the result with the avatar. You don't need to know internal ids like `char_102_texas`:
it is only shown in small print under the name. Enemies, summons, items, Alliances, strategies and UI pictures can all be searched the same way.

(Screenshot here: the results of searching "Texas". `studio-picker.png`)

### 4. Name it and create it

The name is already filled in for you (you can change it); **the plugin id is generated automatically**, valid and not used by anyone yet (2–32 lowercase English letters, digits or `-`). You can fill in the author and license now,
or later under "Info". Press **"Create the plugin"**: the server makes the folder `plugins/<id>/` and writes `plugin.json` (the plugin's manifest) and a readme.

### 5. Drag the portrait onto its place

The left side of the plugin page is a set of **places**: Avatar, E2 avatar, Portrait, E2 portrait. In each place, the original is on the left and your plugin on the right. **Drag your portrait picture onto the "Portrait" place**
(or click the place to choose a file). The studio puts it in the right spot in the plugin folder (`art/char_102_texas/portrait.png`) and updates the manifest at the same time.

On the right is a **live preview** using the game's own interface: the card avatars in the shop and on the Bench, and the detail card when you open an operator (the portrait is there), with **the original and the plugin side by side**.
The model templates also show the game's own battlefield view, where you can switch between each animation (idle, move, attack, skills S1–S3, stunned, down, deploy) and look at both the front and the back.

(Screenshot here: the plugin page after dropping a picture, with your picture in the place and the card avatar and detail card compared side by side on the right. `studio-preview.png`)

Don't want to draw it yourself? Press **"Use existing art"** under the place and search for another operator to borrow their portrait (no files are copied). Press **"Back to the original"** to clear the place.

### 6. Read the hints, fix with one click

If something is wrong, a **plain-language hint** appears under the place: what the problem is and how to fix it, with the English original folded underneath. Many problems have a **"Fix it"** button
(for example a missing permission, a wrongly written version number, a model not packed yet). When the tag at the top right of the plugin says "Loaded: it can be switched on in the game", everything is fine.

### 7. Fill in the info

Under **"Info"** fill in: name, description, version (raise it before each release, for example 1.0.1), author, **license** (whether others may share and modify your work; for example
`CC-BY-4.0` means anyone may repost it with credit), **art sources** (who drew it; if you used someone else's work, state where it came from), homepage, and "Who may switch it on" (the Host for the whole room, or a player for themselves only).

### 8. Pack and download

Press **"Pack and download"** at the top right: the studio generates `plugin.lock.json` (a checksum for each file, and the models' animation data), checks everything again, and then downloads
`<id>-<version>.zip`. That zip is the plugin you can share.

(Screenshot here: the notice bar when packing is done. `studio-packed.png`)

### 9. Switch it on in the game

- **The Host for the whole room**: at the top of the room, click the "Original / Plugins ×N" tag to open the Plugins panel, and tick your plugin. Everyone in the room sees the new portrait.
- **For yourself only**: Settings → Cosmetic plugins, turn on the switch (affects only your own browser).

**Hot reload**: while the studio is open, whenever a plugin file changes (you dropped a new picture in the studio, or saved straight into the plugin folder from a paint program), **the game follows within a few seconds**.
In a room with only cosmetic plugins, if you are the Host (playing in the same browser) or the only person in the room, it is applied again automatically; other rooms prompt the Host to "please press Apply again". Rooms with gameplay plugins are always applied again by the Host by hand, and a running match keeps its original content. Personal plugins follow the next time the plugin list is fetched again.

## Way two: the command line

```bash
# 1. 从模板新建（目标按官方名字找）
node tools/plugin.mjs new art my-texas --target 德克萨斯 --name "我的德克萨斯" --author 你的名字

# 2. 把图片放进文件夹，在 plugins/my-texas/plugin.json 的 "assets" 里写上路径：
#    "assets": { "chars": { "char_102_texas": { "portrait": "art/char_102_texas/portrait.png" } } }

# 3. 检查：每个问题下面一行白话说明和改法（--lang en 是英文，--json 给编辑器和 AI 用）
node tools/plugin.mjs check my-texas

# 4. 打包：写 plugin.lock.json，再打成 zip（默认放在 plugins/_dist/my-texas-1.0.0.zip）
node tools/plugin.mjs pack my-texas --zip
```

The comments in the block, in English: 1. create from a template (the target is found by its official name; `德克萨斯` is Texas, the `--name` is "My Texas", the `--author` is your name); 2. put the picture in the folder and write its path in `"assets"` of `plugins/my-texas/plugin.json`; 3. check: under each problem there is a line of plain explanation and how to fix it (`--lang en` gives English, `--json` is for editors and AI); 4. pack: writes `plugin.lock.json`, then makes the zip (by default `plugins/_dist/my-texas-1.0.0.zip`).

`node tools/plugin.mjs new` without arguments lists all templates. The `"$schema": "../../schemas/plugin.schema.json"` at the top of `plugin.json`
lets editors like VS Code autocomplete fields and mark mistakes.

## Notes on the other templates

- **Spine model**: export a **binary** `.skel` from Spine 3.8 (not a `.json` skeleton), and drag the `.skel`, the `.atlas` and the texture `.png` **together** onto
  the "Front model / Back model" place. The animations (idle, attack, skills, down…) are read from the model automatically when packing; no need to write them by hand. Pack again after changing the model.
- **Voice lines**: one place per voice line (Deployment start, Operation start, Operator selected, deploy, in battle 1–4, Settlement…, with Chinese and Japanese voices separate); put several files in one place
  and the game plays them in turn. Every place has a ▶ button to listen and compare with the original.
- **Music / sounds**: music is split into the "loop part" and an "intro" that plays once (press "Add an intro"); sound effects are `.mp3` or `.ogg`; you can also replace a particular operator's own attack, hit and skill sounds.
- One plugin can replace several things at once: use **"Add something to replace"** at the bottom of the plugin page and pick another template and target (for example, one operator's avatar, model and voice in a single plugin).

## Sharing and installing

- Send the zip to others. They **unzip it into the server's `plugins/` folder** (the unzipped folder name is the plugin id); no server restart needed, just reload the page and it shows in the Plugins panel.
- The studio and the packing tool **do not check** whether a plugin contains official game files: that is the author's own responsibility. Only share what you have the right to share, and state the license and art sources clearly under "Info".
## Making a new operator

1. Open `/studio/` with the studio key, press "New plugin" → "New operator". Pick a reference operator for skills and stats by official name, for example Texas.
2. Name the plugin, confirm the generated id, and create it. The wizard generates its own `char_x_…` id, the normal card `_a` and the elite card `_b`; no manual pairing needed.
3. Fill in the operator's name, Class, Branch, Rarity and Shop tier. Expand "Normal" and "Elite" to change HP, ATK, DEF and the other stats of each.
4. Under "Skill source" pick "Reuse official kit", "JSON skill spec" or "DSL skill / talent". When reusing an official kit you still pick it by official name; when the official kit is fixed, this plugin follows.
   The JSON spec is only for authors who already write JSON. The DSL can be edited directly with drop-downs.
5. Expand "Borrow art this installation has" and pick the sources of the model and avatar by name. This generates `{ ref }` and copies no official art.
6. Press "Save changes", look at the check results, then compare under "Try a battle". Finally "Pack and download". If files were changed in an external editor, reload before saving so you don't overwrite them.

(Screenshot here: `test/e2e/out/studio-gameplay-operator.png`, showing the Normal/Elite stats, the official kit source and borrowed art.)

The command line works too: `node tools/plugin.mjs new operator my-operator --target 德克萨斯` (`德克萨斯` is Texas). Advanced parameters go into a JSON file,
passed with `--options <file name>`, the same as the `options` field of the studio wizard. Then run `check my-operator --strict` and `pack my-operator --zip`.

## Writing a DSL talent

1. Create a "DSL skill / talent". The default is a Caster with a passive 50% ATK increase, with a preparation file that sets round 1 income to 15; you can also start from one of five examples: Earthspirit, Insider, Texas, Kazemaru, Lee. Lee is a preparation effect; the other four generate new operators that can be deployed.
2. Under "Talent" press "Add trigger rule" and choose "On deployment". Under "Condition" choose trigger chance, HP ratio or an Alliance condition as needed.
3. Press "Add action", choose "Add stats" → "ATK ratio", set the value to a number and enter `0.5`. You can also choose the skill blackboard, the talent blackboard, the unit's live stats,
   or combine values with add, subtract, multiply and divide. Targets can be self, the current target, allies/enemies in range, and so on.
4. On the right / below, the plain-language results of the same `validateDsl` check are shown. Fix things as hinted until "DSL validation passed", then save and run a trial.
5. For preparation rules use the "Preparation effects" template: triggers such as round start, income and purchase, with funds, Alliance Stacks or item actions.

The Kazemaru example has no DSL action for "take back the Substitute Doll when the skill ends", so it suits comparisons within 20 seconds; for the full limits see [PLUGIN-DSL.md](PLUGIN-DSL.md) §7 (English: [PLUGIN-DSL.en.md](PLUGIN-DSL.en.md) §7).
The studio generates `kit: { dsl: … }` (battle) or the manifest's `dsl: ["dsl/meta.json"]` (preparation), plus the `dsl` permission.
Saving re-checks the current spec; when the spec is rejected, nothing is written to the files. When the check request fails, it says so clearly and you can retry. The full check and trial runs also verify the content set's permissions, references and numeric caps.

(Screenshot here: DSL chosen in the new-operator wizard, with triggers, conditions and actions expanded; after the browser acceptance run it can be saved as `test/e2e/out/studio-gameplay-dsl.png`.)

## Try a battle

1. Pick a plugin in the plugin list and open "Try a battle". Unsaved changes in the wizard are also tried as a temporary draft; the files on disk are not changed by this.
2. Choose "One operator versus dummy", "One enemy wave" or "Two operators (stationary attack trial)". Source installs can also choose a battle scenario from golden.
   By default the operators the plugin adds are sent first; you can also pick official operators, opponents and waves. The normal presets last 1–120 seconds.
3. Press "Run comparison". The server first checks the plugin and builds the content set; errors explain the reason directly, and a broken plugin is not run. Script plugins still obey the server owner's switch and the lock-file hash permission.
4. Look at the damage, duration, result and difference for original/plugin; a new operator uses the official operator it borrowed from as the original reference, and the reference's name is shown in the table.
   Both replays use the game's own battlefield renderer and can be paused, replayed and sped up; "Event summary and damage statistics" shows the real simulation results.
5. Adjust the numbers and try again. The dummy is a high-HP test target that neither moves nor attacks; the stationary duel is a trial done through the engine's attack interface, enemy-only skills won't treat the other operator as an enemy,
   and it can't be used to judge real PvP balance. Preparation economy effects have to be verified in an actual room; a single battle dispatches no preparation events.

Each comparison runs in its own child process, by default at most 2 at once and at most 20 seconds of wall-clock time each. Timeouts, crashes or replays that are too large all get a plain-language hint.
The browser only plays snapshots and events and does not run plugin battle scripts. Only requests from this computer / the LAN that carry the studio key can start one.

(Screenshot here: `test/e2e/out/studio-gameplay-trial.png`, the side-by-side comparison table and the two replays.)

Other gameplay templates: "Change values" shows the vanilla stat/blackboard fields and their caps (10 times the vanilla maximum of the same blackboard key, at least 64; the lower bound for positive step values is shown next to the field, and invalid values can't be saved); "New mode" inherits an official mode and changes the economy and durations;
"UI widget" picks a slot and changes the title, and after saving plays fake data in the real `pluginFrame` host; "Script plugin" generates an SDK skeleton and `test/` tests, can be viewed read-only in a browser with the key, and trial runs use the sandbox or trusted mode the server owner chose.
Open the plugin folder in an editor and run `node tools/plugin.mjs test <id>`.

The room's Plugins panel now shows boolean/integer/decimal/enum settings from the manifest. When the Host presses "Apply settings", all players reload the same content set.
Other players see them read-only; they can't be changed during a match. Changing a setting of a plugin that was pulled in as a dependency turns that plugin into an explicit choice. When content files change, only the Host is prompted to apply again; a running match keeps the old content.

## When something goes wrong: symptom → cause → fix

The table below is generated automatically from the error catalogue (`node tools/plugin.mjs errors --write`) and is the same text you see in the studio and on the command line. This English twin uses the catalogue's English text, the same as the table in [PLUGINS.md](PLUGINS.md) §15.

| Symptom | Code | Cause | Fix |
|---|---|---|---|
| The studio refuses the action and says why | `PLUGIN_STUDIO_CHANGED` | The plugin changed in another editor | Reload the plugin before saving your changes. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TRIAL_BUSY` | The trial bench is busy | Wait for a running trial to finish. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TRIAL_TIMEOUT` | The trial exceeded its time limit | Shorten the scenario, reduce units or check the plugin effects. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TRIAL_FAILED` | The trial process could not finish | Check the plugin again; consult the server log if it still fails. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TRIAL_LIMIT` | The trial replay exceeded its size limit | Shorten the trial or reduce units and effects. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TRIAL_SCENARIO` | This trial scenario cannot run | Select valid operators, a wave and 1–120 seconds; use the sandbox preview for UI plugins. |
| The room will not switch it on; the panel says why | `PLUGIN_CONSENT` | A player has not consented to trusted plugins | Every seated player must personally accept the risk for this content set. |
| The room will not switch it on; the panel says why | `PLUGIN_TRUST_PUBLIC` | Trusted plugins are refused on a public listening address | Bind to a local address, or explicitly opt into trusted-force after reviewing the risk. |
| The room will not switch it on; the panel says why | `PLUGIN_TRUST_PIN` | The lock is invalid, files changed, or the trusted pin does not match | Repack to verify files; in trusted mode also review and pin the lock SHA-256 in plugins/config.json trusted. |
| The room will not switch it on; the panel says why | `PLUGIN_SCRIPTS_DISABLED` | The server owner has not enabled script plugins | Set SP_PLUGIN_SCRIPTS=sandbox for isolated scripts; native trusted code requires trusted mode, review and a lock pin. |
| The room will not switch it on; the panel says why | `PLUGIN_SCRIPT_CHECK` | The script failed its portability check: {detail} | Import only sp:sdk@1; export synchronous setup(sp) and use deterministic helpers. |
| The room will not switch it on; the panel says why | `PLUGIN_SCRIPT_OVERRIDE` | The plugin did not declare the official kit it replaces | List the official kit id in manifest overrides. |
| The room will not switch it on; the panel says why | `PLUGIN_SCRIPT_CONFLICT` | Two plugins register the same effect | Disable one plugin or use distinct registration ids. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_WORKER_TIMEOUT` | Plugin simulation did not respond | Check plugin loops and reduce simulation work |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_WORKER_FAILED` | Plugin simulation failed | Inspect the log and fix the plugin |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_WORKER_STOPPED` | Plugin simulation stopped | Start a new simulation |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_UNAVAILABLE` | Script sandbox is unavailable | Install dependencies and check the SDK adapter |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_DISABLED` | Script sandbox is disabled | Ask the owner to set SP_PLUGIN_SCRIPTS=sandbox |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_CLASS` | This plugin class cannot enter the sandbox | Pass only script plugins to SES |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_HASH` | Script bytes do not match the content hash | Reapply the plugin and verify the files |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_IMPORT` | Script import is outside the sandbox | Import only sp:sdk@1 and own relative files; avoid cycles |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_SYNTAX` | Script uses unsupported module syntax | Use synchronous setup and static imports; see the script reference |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_LIMIT` | Script source exceeds sandbox limits | Reduce source size and file count |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SANDBOX_MATH` | Script math is outside the deterministic domain | Use finite numbers and integer exponents |
| The room will not switch it on; the panel says why | `PLUGIN_UNKNOWN` | This server has not installed that plugin | Put the plugin folder into the server's plugins/ folder (the folder name is the plugin id); if it is gone, switch it off in the 插件 panel. |
| The room will not switch it on; the panel says why | `PLUGIN_BLOCKED` | That plugin cannot be switched on here: this version does not apply its class, or its scope does not include this place | A cosmetic plugin has "class": "cosmetic"; its scope is ["room"] (the host switches it on for the room), ["personal"] (a player for themself) or both. |
| The room will not switch it on; the panel says why | `PLUGIN_DEPENDENCY` | A plugin it requires is missing or out of its version range, or the load-order hints of some plugins form a cycle | Install the plugins its "requires" names (within their ranges), or remove the loadAfter / loadBefore entries that point at each other. |
| The room will not switch it on; the panel says why | `PLUGIN_CONFLICT` | The chosen plugins conflict with each other | Switch one of them off; a plugin's "conflicts" says which ones it cannot be used with. |
| The room will not switch it on; the panel says why | `PLUGIN_LIMIT` | Over this server's limit: {detail} | Switch on fewer plugins, or make them smaller (compress pictures and sounds, remove unused files, fewer whole-record references). |
| The room will not switch it on; the panel says why | `PLUGIN_INCOMPATIBLE` | That gameplay plugin is not made for this server's game version (or its plugin API) | Use a version of the plugin made for this game version (its "app" says which), or ask its author for an update. |
| The room will not switch it on; the panel says why | `PLUGIN_BUSY` | This server already runs as many plugin sets at once as it allows | Try again later, or pick the same plugins as a room already using some; the server owner can raise maxSets in plugins/config.json. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_NO_MANIFEST` | The plugin folder has no plugin.json | Every plugin folder needs a plugin.json (its manifest). The studio's 新建插件 or node tools/plugin.mjs new writes one. The older pack.json belongs to a language pack in packs/. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_JSON` | {where} cannot be read: it is not valid JSON, or too large | Look for a missing or extra comma, quote or bracket (no comma after the last item); a JSON file may be 8 MB at most. Editing in the studio avoids typing mistakes. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_JSON_LIMIT` | {where} is beyond the JSON limits (nested too deep, or a number too large) | Nest at most 64 levels; numbers must be finite and within ±1,000,000,000. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_MANIFEST_SHAPE` | plugin.json is not a JSON object at the top | The whole file is one { } object of "name": value pairs. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_MANIFEST_VERSION` | "manifest": 2 is missing or another number | Write "manifest": 2 in plugin.json (the version of the manifest format; 2 is the only one). (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ID` | The folder name “{id}” is not a plugin id | The plugin id is the folder name: 2–32 lower-case letters, digits and -, not starting with - (e.g. texas-red). Rename the folder. |
| The plugin works, with a note in the check | `PLUGIN_ID_MISMATCH` | The "id" in the manifest is not the folder name “{id}”; the folder name decides | Remove "id" from the manifest (the folder name is the id) or make it the folder name. (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_FIELD_UNKNOWN` | “{where}” is not a field of the manifest and is ignored | Check its spelling (case matters) or remove it. (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CLASS` | "class" is missing or not a plugin class | A cosmetic plugin has "class": "cosmetic". The classes: lang, cosmetic, content, script, ui, trusted. |
| The plugin works, with a note in the check | `PLUGIN_TEXT` | “{where}” should be a text or { "<lang>": "text" }; it is ignored | Write "Name" or { "zh": "名字", "en": "Name" }. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_LANG_CODE` | “{where}” is not a language code | Use a language code such as zh, en, ja, ko or zh-TW. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_VERSION` | The plugin's "version" is missing or not a version number | Write three numbers such as "1.0.0"; raise it whenever the plugin changes (1.0.1, 1.1.0 …). (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_APP` | The game versions the plugin is made for, "app", are missing or not a range | Write a range such as ">=0.3.0 <0.4.0" (this game is {app}). (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_APP_MISMATCH` | The plugin is made for the game {range}; this server is {app} | A cosmetic plugin still works (a reminder only). Once it is checked with this version, widen "app" to include {app}. (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_API` | The plugin API level "api" is missing, not an integer, or not supported | Write "api": {current} (this game supports {min}–{current}). (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SCOPE` | "scope" is not one this class allows | A cosmetic plugin has ["room", "personal"]: room — the host switches it on for the whole room; personal — a player for themself in 设置. (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_HOMEPAGE` | "homepage" is not an http(s) address and is ignored | Write a full address such as https://example.com/my-plugin, or remove it. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DEPS` | A dependency (requires / optional / conflicts) is not right: {where} | Write { "<plugin id>": "<version range>" }, e.g. { "base-skin": ">=1.0.0" }; never the plugin itself, never one both required and in conflict, at most 32. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ORDER_HINTS` | A load-order hint (loadAfter / loadBefore / priority) is not right: {where} | loadAfter and loadBefore are lists of plugin ids (never one in both, never the plugin itself); priority is an integer within ±1000, default 0. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SETTING` | A setting is not right: {where} | Each setting is { "type": … }: boolean, integer / number (with min and max), enum (with options); its default within them; at most 32, no free text. |
| The plugin works, with a note in the check | `PLUGIN_SETTING_FIELD` | A setting has a field it does not know, “{where}”; it is ignored | A setting knows type, default, min, max, step, options and label only. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PART_CLASS` | “{where}” is not something a {class} plugin carries | A cosmetic plugin carries "assets" and "theme" only, a ui plugin "entry.client" and "slots"; numbers and new operators belong to a content plugin. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PART_SHAPE` | “{where}” is not written the right way | Write the path of a .json file of the plugin folder (or a list of them); "assets" and "theme" may also be the { … } object itself. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ASSET_FILE` | The file of “{where}” is not right: not a path inside the plugin folder, or not the kind of file this place takes | Write a path inside the plugin folder such as art/avatar.png. Pictures are .png .jpg .webp, sounds .mp3 .ogg, models .skel with .atlas (pages .png). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_THEME_URL` | "theme" names a URL | A theme sets colours, lengths and the plugin's own font names only — never a URL (it could leak data). |
| The plugin works, with a note in the check | `PLUGIN_THEME_UNUSED` | This version does not apply "theme" yet (only the art of "assets") | Keep it for a later version, or remove it to silence the note. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ENTRY` | An entry point is not right, or this class has none: {where} | A cosmetic plugin needs no "entry": remove it. A ui plugin has "entry": { "client": "ui/index.html" } (an .html file of the plugin folder). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_LANG_ONLY` | “{where}” belongs to a language pack (class lang), not a {class} plugin | Remove it; for a language pack, make "class": "lang". (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PERMISSION` | A permission is not right: “{where}” is unknown or not one a {class} plugin may have | A cosmetic plugin's permissions: assets.override (replace art the installation has), assets.add (a new entry), theme; a ui plugin's: ui.frame. "permissions" is a list. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PERMISSION_MISSING` | “{where}” needs the permission {need}, which the manifest does not declare | Add "{need}" to "permissions". (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_PERMISSION_UNUSED` | The permission {permission} is declared but nothing in the plugin uses it | Remove "{permission}" from "permissions" (the fewer, the more trust). (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_EMPTY` | The plugin carries nothing | A cosmetic plugin lists the art it replaces in "assets". The studio's templates are the easiest start. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_LINK` | {where} is a symbolic link; a plugin holds plain files only | Copy the real file into the plugin folder and remove the link. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_NAME` | The file name “{where}” cannot be used | Names of files and folders use letters, digits, . _ - and spaces; none starts with . or is "..". |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_TYPE` | {where}: a {class} plugin may not carry this kind of file | Pictures are .png .jpg .webp (no SVG), sounds .mp3 .ogg, models .skel .atlas; documents (.md, .txt, README, LICENSE) may sit beside them. Move the file out of the plugin folder (the one-click fix moves it to plugins/_moved/, never deletes it) or convert it. (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_FRAME` | {where} is a frame file outside the folder of entry.client | Put a ui plugin's .html .js .css into the folder of entry.client. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_SIZE` | The plugin is too large: {where} | A plugin holds at most 200 MB in 5000 files (2000 folders, 12 levels deep), a JSON file at most 8 MB. Compress pictures and sounds, remove unused files, or split it. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_MISSING` | The manifest names {file}, which the plugin folder does not hold | Put the file there (folders and case must match) or correct the path in the manifest. Dropping the file on its slot in the studio puts it in the right place. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FILE_OUTSIDE` | {where} leads out of the plugin folder or cannot be read inside it | A plugin uses plain files of its own folder only: copy the file in (no link) and check that it opens. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_LANG` | A language pack's language is not right: {where} | "lang" is a language code (en, ja, zh-TW …); zh is the source language and never a pack; machineTranslated is true or false. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_LANG_FILES` | A language pack's "files" are not right: {where} | "files" is { "ui": "ui.json" } (required) and optionally "data", both .json files of the pack. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PACK` | An older content pack (pack.json) is not right, or this version does not load its type: {where} | packs/ loads language packs ("type": "lang") only. Art and data are plugins of plugins/ (plugin.json, "manifest": 2). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ASSETS_SHAPE` | The asset overlay is not written the right way: {where} | Follow data/assets.json: chars → operator id → avatar / portrait / spine …, sounds under audio. The studio's templates write it for you. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_ASSET_KEY` | “{where}” is not the name of an asset entry | An entry is named by an internal id such as char_102_texas (letters, digits, _ . / -). The studio finds it by its official name. |
| The plugin works, with a note in the check | `PLUGIN_ASSET_IGNORED` | “{where}” is not something a cosmetic plugin changes; it is ignored | Check the spelling; PLUGINS.md §9 lists what a cosmetic plugin changes (avatars, portraits, models, icons, interface pictures, voices, sounds, music). (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_REF` | The reference at “{where}” is not right: not written as one, or the installation has no such art | { "ref": "char_112_siege" } borrows an entry of the same kind the installation has. Pick it from the list with the studio's 用已有的素材, or remove the write. (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SPINE` | The Spine model at “{where}” is not right | The .skel and the .atlas sit side by side with one name (t.skel + t.atlas), the .png pages beside the atlas and in "textures"; clip data is never written by hand — 打包 makes it. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SPINE_PAGES` | {file} uses a page that "textures" does not list | List every page of the atlas in "textures" (the one-click fix fills it from the atlas). (the studio fixes it in one click) |
| The plugin works, with a note in the check | `PLUGIN_SPINE_NOTE` | The model {file} has a small issue: {detail} | Usually "textures" names a picture the atlas does not use, or a part is missing from the atlas. The model usually still shows: look at it in the preview. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SPINE_PARSE` | The model {file} cannot be read: not a Spine 3.8 binary skeleton the game reads, or it has no animations | Export a binary .skel with Spine 3.8 (not a .json skeleton), with its animations (Idle, Attack, Die …). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_LOCK` | plugin.lock.json is broken or of another format | Make it again with the studio's 打包 or node tools/plugin.mjs pack; never edit it by hand. (the studio fixes it in one click) |
| The plugin is skipped: its model is not packed yet | `PLUGIN_LOCK_MISSING` | The model {file} has no clip data yet (plugin.lock.json lacks it) | Press 打包 (or run node tools/plugin.mjs pack <plugin>): it reads the model's clips into plugin.lock.json. (the studio fixes it in one click) |
| The plugin disappeared after a model file was replaced | `PLUGIN_LOCK_STALE` | The model {file} changed; plugin.lock.json still holds the old one's data | Press 打包 again (or run node tools/plugin.mjs pack): the lock follows the new model. (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DUPLICATE` | A plugin id or a language is taken twice: {where} | Rename the folder (the plugin id; on Windows and macOS another case is the same name) or remove the duplicate. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_UNREADABLE` | Reading the plugin failed: {detail} | Check the files' permissions; if a program is writing the folder, wait until it is done. |
| The plugin works, with a note in the check | `PLUGIN_REQUIRES_MISSING` | The plugin it requires, {dep}, is not installed or not within {range} | Install the required plugin within its range; otherwise a host switching it on is refused. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_PATH` | This path cannot be used: {detail} | Files stay inside the plugin's own folder: no .., no part starting with ., no special characters, no link leading out. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_SIZE` | The file is too large (at most {max}) | Compress the picture or sound first (a portrait within 1024 px as PNG / WebP is plenty). |
| The studio refuses the action and says why | `PLUGIN_STUDIO_EXISTS` | There is a plugin “{id}” already | Choose another id, or open that plugin from the list. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TEMPLATE` | No such template: {template} | Pick one of the studio's templates (node tools/plugin.mjs new without arguments lists them). |
| The studio refuses the action and says why | `PLUGIN_STUDIO_TARGET` | No target “{target}” to replace | Search by its official name (e.g. 德克萨斯) and pick one of the results. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_FILE_KIND` | This place takes {kind}; the dropped file is {ext} | A picture place takes .png .jpg .webp, a sound place .mp3 .ogg, a model place its .skel, .atlas and .png together. |
| The studio refuses the action and says why | `PLUGIN_STUDIO_REQUEST` | The studio's request is not right: {detail} | Reload the studio and try again; if it stays, ask on GitHub with this text. |
| The studio only shows plugins; it cannot make or change one | `PLUGIN_STUDIO_KEY` | Changing a plugin needs the studio's key, which this browser does not have (or it is not the right one) | Open the address on the "Studio" line of the server's window (it carries the key, which is also in plugins/.studio-key), or paste it into the box at the top of the studio. |
| A plugin chosen for removal stays: it is in use | `PLUGIN_STUDIO_IN_USE` | The plugin “{id}” is in use (room {rooms}) and was not removed | Wait until those rooms close, or until their host switches it off in the room's plugin panel (a room in a match can do so once the match is over), then remove it. |
| A plugin chosen for removal could not be moved | `PLUGIN_STUDIO_REMOVE` | The plugin “{id}” could not be moved to plugins/_removed/: {detail} | Close programs that hold files of this plugin open (an image editor, Spine …), make sure the server may write the plugins/ folder and try again — or move the folder out of plugins/ yourself. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CONTENT_FILE` | The data file “{where}” cannot be read: {detail} | "data" lists .json files inside the plugin folder; no symbolic links, nothing outside the folder. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CONTENT_FORMAT` | The data file “{where}” is not in the right format: {detail} | A patch file is { "patch": 1, "ops": [ … ] }, a records file { "records": 1, "entries": [ … ] }; plugins/_template/content/ has one of each. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CONTENT_PERMISSION` | The data file “{where}” needs a permission the manifest does not declare: {detail} | Changing existing values needs "data.patch", adding records (new operators, enemies …) "data.add": list them in "permissions". (the studio fixes it in one click) |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_LIMIT` | The data is too large or nested too deep ({where}): {detail} | One JSON file is at most 8 MB and 64 levels deep, a whole content set at most 300 MB: split large files, drop what is unused. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_NUMBER` | A number is not allowed ({where}): it must be finite and within ±1,000,000,000 | Make the number smaller; data never holds infinities or huge numbers. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_TYPE` | “{where}” is not a plain JSON value: {detail} | Write JSON values only: objects, lists, strings, numbers, true / false, null. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_PATH` | “{where}” uses a key that is not allowed | Keys such as __proto__, prototype and constructor cannot be used (they could corrupt the program's objects): rename it. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_BOUND` | A value is outside what a plugin may set ({where}): {detail} | A value may be up to 10 × the official maximum of the same key (at least 64); a step — an interval, a period, a cost — no smaller than a tenth of the official minimum. Make it smaller: creative values within 3 × the official ones always pass. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_REQUIRED` | The merged data lacks something or is broken ({where}): {detail} | A patch must not remove a field or a table the game needs; the original line says which one. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_REFERENCE` | “{where}” refers to something that does not exist: {detail} | Check the spelling: the bond, enemy, operator or effect ids it names must exist in the game or in this plugin (same case). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DATA_PAIR` | The normal and elite pieces of an operator do not match ({where}) | A new operator comes in pairs: …_a the normal piece, …_b the elite one (isGolden: true), with the same charId and tier; a compact record (a records file) makes the pair for you. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PATCH_OP` | An unknown patch operation ({where}) | "op" is one of set, merge, add, append, remove. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PATCH_PATH` | A patch points at the wrong place ({where}): {detail} | "file" names a data table (chess, bonds, enemies …), "id" a record, "path" a list of keys and array indexes such as ["bb", "atk"]. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PATCH_TYPE` | A patch value has the wrong type ({where}): {detail} | "set" keeps the old type (a number stays a number, a list a list); a new record is an object; "ops" is a list. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_PATCH_SETTING` | A patch uses a setting that does not exist ({where}) | The name in { "$setting": "<name>" } must be declared in the manifest's "settings". |
| The plugin works, with a note in the check | `PLUGIN_PATCH_OVERRIDE` | Two plugins change the same value ({where}); the one loaded later wins | Usually fine; to make one plugin's value win, order them with loadAfter / loadBefore, or switch one off. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_RECORD_EXISTS` | The record to add exists already ({where}) | Change an existing record with a patch (set / merge); a new record needs a new id. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_RECORD_DELETE` | A plugin cannot delete a record ({where}) | To keep an operator or an enemy out, change the pools, stages or waves that use it — never remove the record. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_RECORD_ID` | A new record's id is outside this plugin's namespace ({where}): {detail} | A new record's id carries the plugin id: plugin my-mod's new operator is char_x_my_mod_<name> (its - becomes _), a skill skx_my_mod_…; with kitRef the official skill ids may stay. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_RECORD_TYPE` | A compact record is not written the right way ({where}): {detail} | An operator has a charId, a name, a profession, a position and a rarity (1–6); its kit has exactly one source: generic, ref (an official kit), dsl or a JSON SkillSpec. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_RECORD_SKILLS` | An operator's skills are not right ({where}): {detail} | The skills list has exactly one default (default: true), the same as "skill"; when a description's count changes, change both. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_KIT_REF` | The official kit that "kitRef" names does not exist ({where}) | kitRef names an official operator (char_102_texas for example), whose skill logic is reused; spell it as the game does. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_SKILL_SPEC` | A JSON SkillSpec is not right ({where}): {detail} | Follow the SkillSpec of docs/PLUGINS.md §10: kind and the known fields of mods; talentMods go with a JSON SkillSpec, never with kit.ref. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_EFFECT_REF` | An effect reference is not right ({where}): {detail} | effectRef names an official item or tactic record; garrison effects and buff keys must be ones the game has. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_I18N` | A translation file of the plugin is not right ({where}): {detail} | A translation file is { "version": 1, "lang": "en", "files": { … } } with lang matching its name; it replaces existing text only, never adds a field. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_UI_SLOTS` | The "slots" of a ui plugin are not right: {detail} | "slots" is a list of hud.right, result.tab, stats.tab and room.panel, each at most once. |
| The plugin works, with a note in the check | `PLUGIN_UI_NO_SLOT` | The ui plugin asks for no slot, so its page is never shown | List where it goes in "slots", for example ["hud.right"]. |
| The ui plugin's page gets a refusal (ok: false, a rejected or a limit message) | `PLUGIN_SLOT` | The slot a ui plugin asked for was not granted: its manifest's "slots" does not list it, or another plugin holds it | List the slot in "slots" of plugin.json (hud.right, result.tab, stats.tab, room.panel). One plugin per slot: the first switched on gets it. |
| The ui plugin's page gets a refusal (ok: false, a rejected or a limit message) | `PLUGIN_RATE` | The ui plugin sends messages too fast and was throttled | A plugin sends at most 20 messages a second (bursts of 40). Batch them, or send only when something changed. |
| The ui plugin's page gets a refusal (ok: false, a rejected or a limit message) | `PLUGIN_STORAGE` | The ui plugin's storage request was refused: the key is not allowed or the space is used up | A key is 1–64 characters of letters, digits and . _ -; a value's JSON is at most 4096 bytes; a plugin keeps at most 32 keys and 32 KB. |
| The ui plugin's page gets a refusal (ok: false, a rejected or a limit message) | `PLUGIN_INTENT` | The ui plugin tried to send a match action, which is refused | A ui plugin watches and never plays (it cannot become a bot or a cheat): do not send hello, ping, room.*, g.* or b.* messages, nor carry one inside another message. |
| The ui plugin's page gets a refusal (ok: false, a rejected or a limit message) | `PLUGIN_SHAPE` | A message from the ui plugin is not shaped right and was dropped | Every message is { "v": 1, "t": <type>, … } with a type of ready, slot, resize, storage, notice or stats, at most 8 KB; schemas/ui.schema.json has the shapes. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_SHAPE` | The DSL spec is not shaped right: {detail} | The whole spec is one object: { "dsl": 1, "pluginId": "<plugin id>", then "skill", "skills", "talents" or "meta" }. |
| The plugin is not listed (skipped); check names the DSL version | `PLUGIN_DSL_VERSION` | This version reads "dsl": 1 only | Put "dsl": 1 at the top of the spec. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_PLUGIN_ID` | The plugin id the DSL spec names is not the plugin that carries it: {detail} | Write the id of the plugin that carries the spec (its folder name) as "pluginId", or leave it out and the server fills it in. A plugin cannot spend another plugin's action budget. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_BUDGET` | "budget" is a whole number from 1 to 10,000,000 | Write a whole number, or remove "budget" for the default of 8000. A plugin whose actions run more often than that in one battle stops for that battle. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_LOOP` | The DSL names a loop or outside code, or nests too deep: {detail} | The DSL has no loops or code (loop, while, script …); "then" nests at most 4 deep and one value at most 64 levels and 64 nodes. Complex logic belongs to a script plugin. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_TRIGGER` | An unknown trigger ({where}): {detail} | In battle: always, deploy, battleStart, attack, hitDealt, hitTaken, kill, allyDeath, skillStart, skillEnd, every, hpBelow; in prep: roundStart, income, buy, sell, refresh, merge, levelUp, battleResult. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_CONDITION` | A condition is not right ({where}): {detail} | A condition is { "<name>": value } with chance, targetHas, selfHpBelow, enemiesInRange, bondActive or skillActive; prep takes round, chance and bondActive only. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_ACTION` | An action is not right ({where}): {detail} | "do" is a list of actions, each one of buff, status, damage, heal, sp, dp, push, pull, spawnToken, layers, shield, fx (prep: funds, layers, gainItem); docs/PLUGIN-DSL.md §4 has their fields. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_TARGET` | A target is not right ({where}): {detail} | A target is self, target, source, alliesInRange, enemiesInRange, enemiesInRadius, lowestHpAlly or allAllies; the "tile" of spawnToken is "around" or { "r": row, "c": column }. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_EVERY` | The interval of "every" is too short ({where}): {detail} | "seconds" is at least one tick (1/30 s). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_NUMBER` | A number is out of range ({where}): {detail} | Write finite numbers: the threshold of hpBelow is above 0 and at most 1, "times" a whole number from 1 to 8. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_DIV0` | A division by 0 ({where}) | The second term of "div" cannot be 0; to keep a value as it is, multiply it by 1. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_VALUE` | A value is not right ({where}): {detail} | A value is a number, { "bb": "<key>" }, { "talent": [index, "<key>"] }, or mul, add, sub, div, min, max of them; a list appears only inside those. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_SKILL` | A skill spec is not right ({where}): {detail} | "skill" is an object whose "kind" is instant, duration, ammo, charges, toggle or passive; several skills are "skills": { "<skill id>": { … } }. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_META` | The prep spec is not right ({where}): {detail} | Write "meta": { "on": [ { "when": <trigger>, "do": [ <actions> ] } ] }; "meta.key" is effect:<plugin id>:<name> with this plugin's own id. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_DSL_TALENT` | A talent is not right ({where}): {detail} | "talents" is a list of objects such as { "when": <trigger>, "if": <condition>, "do": [ <actions> ] }. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CATALOG_SHAPE` | The catalogue file is not in the right shape: {detail} | A catalogue is a JSON object with "catalog": 1, a "name" and a "plugins" list. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CATALOG_URL` | A catalogue or plugin address is not an https address this installer will fetch: {detail} | The address starts with https://, the host has a dot, and it has no user or password. A download uses a public address on port 443 only. Loopback, private, link-local and .local are refused unless the operator names the host in allowDownloadHosts. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CATALOG_HASH` | A catalogue entry has no sha256, or it is not 64 lowercase hex digits: {detail} | Each plugin names the SHA-256 of its zip (64 lowercase hex digits). |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CATALOG_ID` | A plugin id is not valid, or it is repeated: {detail} | An id is 2 to 32 lowercase letters, digits and hyphens, and it appears once in the catalogue. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_CATALOG_FIELD` | A catalogue field is not valid: {detail} | Follow docs/plugin-catalog.example.json: version is semver, class is a known class, and long text is shortened. |
| The studio refuses the action and says why | `PLUGIN_CATALOG_SIZE` | The catalogue file is too large: {detail} | The catalogue document itself is at most 1 MB. A plugin zip has its own 200 MB cap. |
| The studio refuses the action and says why | `PLUGIN_CATALOG_FETCH` | The catalogue could not be fetched: {detail} | Check that the address is public https on port 443, that the server can reach it, and that it is not redirected to a non-public address or off https. The one deadline covers the body, not each redirect on its own. A local catalogue file works too. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_URL` | The install address is not a public https address: {detail} | Install a public https zip on port 443 only. A private or loopback address is refused unless the operator allowlist names it. A file on this machine can be given as a path, including a Windows drive or a UNC path. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_HASH` | The zip SHA-256 does not match, or none was given: {detail} | An https install needs --sha256 (or the sha256 of a catalogue entry). Do not install when the hash differs. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_SIZE` | The zip is over the size cap, or it is not the byte length the catalogue names: {detail} | A plugin is at most 200 MB. When the catalogue gives bytes, it has to be the zip size. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_TIMEOUT` | The download timed out: {detail} | Check the network and try again. A zip waits up to 60 seconds, a catalogue up to 20. That one deadline covers the connection, the redirects and the body. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_FETCH` | The download failed: {detail} | Check that the address opens and answers with the zip (HTTP 200). |
| The studio refuses the action and says why | `PLUGIN_INSTALL_REDIRECT` | The download was redirected to a non-public address, off port 443, or too many times: {detail} | Only a public https redirect on port 443 is followed, at most 5. Use a direct https address. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_ZIP` | This zip cannot be installed: {detail} | The zip needs plugin.json (optionally inside one folder named with the plugin id). No path traversal, symbolic links, encryption or too many files. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_CHECK` | The plugin failed its check and was not placed in plugins/: {detail} | Fix the plugin as node tools/plugin.mjs check says, then install again. A failed check deletes only the temporary files. |
| The studio refuses the action and says why | `PLUGIN_INSTALL_EXISTS` | plugins/ already has this id: {detail} | Without --force nothing is overwritten. --force moves the old folder to plugins/_replaced/ and does not delete it. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_INPUT` | This is not a Forge pack that can be read: {detail} | Choose a workshop folder that contains pack.json, or a zip of that folder. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_ZIP` | This pack's files are not safe to unpack: {detail} | Paths must stay inside the pack, with no symbolic links, at most 5000 files and 200 MB. Import another pack. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_JSON` | JSON in the pack cannot be read: {detail} | JSON must parse, stay within 8 MB and 64 levels of nesting, and keep numbers within ±1e9. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_ID` | This pack's id cannot become a plugin id: {detail} | Pass --id with a plugin id: 2–32 lower-case letters, digits and -, for example rose-skin. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_EXISTS` | The destination folder already exists, so nothing was written: {detail} | Choose another --out or --id, or move the existing plugin folder aside and import again. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_FORGE_SCRIPT` | A script in the pack was not imported and was not run: {detail} | A kits/<id>.js becomes the sandboxed script plugin when its id is an imported record (or an official id declared in overrides) and its imports map to sp:sdk@1 (@kit/tier1.js, @sim/constants.js, @sim/detmath.js, the pack's ./ files); otherwise rewrite the logic as a JSON SkillSpec, DSL or a script plugin. The importer never runs a .js from the pack. |
| The plugin is not listed (skipped); the start log and check say why | `PLUGIN_INVALID` | The plugin has a problem: {detail} | Read the original line; if it is unclear, ask on GitHub with it. |

## Importing from a Forge pack

If you have a Forge workshop pack (a folder with a `pack.json`, or a zip made from it), you can import the parts that match as our plugins.

In the studio press **"Import from a Forge pack"**. Choose a zip, or choose the whole folder. First look at the import report; only after you confirm is anything written to `plugins/`.
The report says what was imported, what it was changed into, and what wasn't imported and why. Common reasons for not importing: it is server-side logic, it would change the protocol, it is a script that doesn't match
(the importer **runs none** of the code in the pack), or the mount point doesn't match our interface slots.

The same on the command line:

```bash
node tools/plugin.mjs import-forge <工坊包目录或 zip> [--out plugins/<id>] [--id <id>] [--dry-run] [--json] [--no-scripts]
```

(`<工坊包目录或 zip>` is the workshop pack's folder or zip.) `--dry-run` only prints the report and writes no files. Skins, portraits, avatars, icons, Spine, voice lines, and music and sound effects that match become a cosmetic plugin; value changes,
new operators, paired new pieces in `chess.json` (`_a` normal, `_b` elite; 6-stars with `isDiy` are written as Custom) and new enemies become a data plugin; UI strings
become a language pack; announcements and credits go into the manifest's description. The parts that don't match stay in `IMPORT-REPORT.md`, one line each in Chinese and English.

What about skills:

- When an operator's or piece's skill ids are all official skills of **one and the same official operator**, the record keeps those ids and directly uses that operator's kit in this game (Custom operators like Clementia
  use her Custom kit, pieces use the kit of the corresponding official piece). If only some match, or they match several operators, the generic kit is used and the report says why.
- The `kits/<piece id>.js` behaviour scripts in the pack are combined into a **script plugin** `kits-<id>`: one scope per file, `@kit/tier1.js`,
  `@sim/constants.js` and `@sim/detmath.js` become `sp:sdk@1`, and files in the pack starting with `./` come along. Other imports (`@kit/tier3.js`,
  `@sim/dir.js` and the like) can't be mapped, so that script is not written and the report names it. It is **not executed** during import.
- This script plugin **only runs when the server owner sets `SP_PLUGIN_SCRIPTS=sandbox` (or trusted mode) and the room selects it** (SES sandbox, see the next section).
  A server without scripts can still use the data plugin; that operator just uses the generic kit (or the official kit).
- Don't want the script plugin: add `--no-scripts` on the command line, or tick "Don't write a script plugin (the kits/ behaviour scripts)" in the studio.
- Note for kit authors: buffs added in a talent's `install` need `allowDead: true` (permanent ones also `persist: true`, like `kit.statBuff`).
  Before the battle the operators aren't deployed yet, and buffs without it are refused by the engine (Forge's engine has the same rule). The report names such kits; Forge's own
  `kit-demo` example is one of them, and after import its "ATK +25%" has no effect.

The full mapping table is in [PLUGINS.md](PLUGINS.md) §16.

## Turning on script plugins

The "Script plugin" template generates an example skill and author tests. After editing in an editor, run:

```bash
node tools/plugin.mjs check my-script --strict
node tools/plugin.mjs pack my-script
node tools/plugin.mjs test my-script
```

`test` runs the author's test code on this computer and is not bound by the server's sandbox switch or the trusted-hash permission; it is not a security check for production.
Real rooms have scripts off by default. Once the server owner sets `SP_PLUGIN_SCRIPTS=sandbox` (or adds `--scripts sandbox` at startup; on Windows just
double-click `scripts\start-windows-sandbox.bat`), the `script` class runs in the SES sandbox, in a Worker in the browser and a restricted child process on the server; the lock file must match all files, each player does not have to consent individually, and public listening is allowed. After changing files, pack again.

`trusted` / `trusted-force` is native trusted execution: after reviewing the files, the server owner fills in the lock file's
SHA-256 under `trusted` in `plugins/config.json`, and every seated player also has to consent. Public, `0.0.0.0` / `::` wildcard listening, or a public reverse proxy needs `trusted-force`.
The first time an uncached script is applied, each plugin is probed for up to 5 seconds, which may briefly stall the lobby; `SP_SCRIPT_PROBE_MS` adjusts this.
Detailed limits are in [PLUGINS.md](PLUGINS.md) §13 and the [deployment guide](DEPLOY.md) (English: [DEPLOY.en.md](DEPLOY.en.md)). The DSL in data plugins does not need this switch.

## Installing by address or from a community catalogue

In the studio press **"Install from a catalogue"**, enter the HTTPS address of a catalogue provided by the community, or choose a catalogue JSON file on this computer, check the versions and compatibility, then install.
Every download in the catalogue carries the zip's SHA-256, and the server downloads and verifies it. The project does not host these plugins.

The command line can also install a local zip, download by address, or view a catalogue:

```bash
node tools/plugin.mjs install ./my-skin-1.0.0.zip
node tools/plugin.mjs install https://example.invalid/my-skin.zip --sha256 <发布者提供的64位哈希>
node tools/plugin.mjs catalog ./catalog.json
```

(`<发布者提供的64位哈希>` is the 64-character hash given by the publisher.) The example domain can't be downloaded from; replace it with the address the publisher gave you. Remote downloads by default only accept public HTTPS on port 443.
A plugin with the same name is not overwritten by default; to replace it add `--force`, and the old folder is moved to `plugins/_replaced/`, not deleted.
The install check doesn't run the code in the package; installing a script plugin also doesn't mean it has been allowed to run. The full rules are in [PLUGINS.md](PLUGINS.md) §17.

## Deleting several plugins at once

In the plugin list on the left of the studio, each plugin has a **checkbox** in front of it. Tick the plugins you don't want ("Select all" ticks all of them at once, "Clear selection" unticks all), then press
**"Delete selected (N)"**. The confirmation box lists these plugins' names and ids; after you press "Delete", their folders are moved into the server's `plugins/_removed/` folder,
and **are not deleted for good**: the time of deletion is appended to the folder name, for example `my-texas-20261015-083000-123`. To restore a plugin, move its folder from
`plugins/_removed/` back to `plugins/`, rename it back to the plugin id (remove the time at the end), and reload the page to see it again. When you're sure you don't want them, empty
`plugins/_removed/` yourself.

**Plugins in use are not deleted**: while some room has it on (a running match counts too), it stays where it is, the studio lists it with the reason (including the room number), and its tick is kept;
delete it after the room disbands, or after the Host turns it off in the room's Plugins panel. Plugin folders that are symbolic links can't be ticked, and the studio won't move them. Cosmetic plugins and interface plugins that players
turned on in their own browsers (the switches in Settings) don't count as in use: once deleted, it stops working in that player's browser, and after restoring it works again.

## Advanced

- The full description of the fields: [PLUGINS.md](PLUGINS.md) §3 (the manifest), §4 (permissions), §5 (files and limits), §9 (cosmetic plugins), §15 (the studio and the tools, including the studio's API).
- JSON Schema: `schemas/plugin.schema.json`, `schemas/overlay.schema.json`, `schemas/records.schema.json`, `schemas/dsl.schema.json`, `schemas/ui.schema.json`; stable and experimental interfaces are in [PLUGIN-API.md](PLUGIN-API.md).
- Having an AI help you make plugins: ask it to read `plugins/AGENTS.md` first and check its own work with `node tools/plugin.mjs check --json`.

## Where the screenshots come from

This repository holds no screenshots (they contain the official game's art, which by the rules can't go into git). To see real screenshots, run the browser tests on a computer with the art assets installed:

```bash
SP_E2E=1 node --test test/ui/studio.e2e.test.js
SP_E2E=1 node --test test/ui/studio-gameplay.e2e.test.js
SP_E2E=1 node --test test/ui/plugins-settings.e2e.test.js
```

The screenshots appear in `test/e2e/out/`: `studio-start.png` (the studio's home page), `studio-templates.png` (picking a template), `studio-picker.png` (searching by name),
`studio-preview.png` (the side-by-side preview after dropping a picture), `studio-packed.png` (packing done).
