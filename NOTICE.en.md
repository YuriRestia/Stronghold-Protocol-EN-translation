# Copyright and Usage Notice (NOTICE)

> English translation of [NOTICE.md](NOTICE.md), provided for convenience only. The Chinese original is the authoritative version.

**卫戍协议：盟约 · Stronghold Protocol** is an **unofficial fan remake** of *Stronghold Protocol: Alliance*, a limited-time mode of *Arknights*. It has **no affiliation whatsoever** with Shanghai Hypergryph Network Technology Co., Ltd. (Hypergryph), Yostar or their affiliates, and has not been authorized or endorsed by them.

## 1. Code license: GPL-3.0-or-later

Copyright (C) 2026 Stronghold-Protocol contributors

The source code and documentation text written by this project (JS / CSS / HTML under `server/`, `shared/` and `public/`, plus `tools/`, `scripts/`, `test/`, `docs/`, etc.) are released under the **GNU General Public License version 3 or (at your option) any later version** (GPL-3.0-or-later); the full text is in [LICENSE](LICENSE). You may use, modify and redistribute this code under the terms of that license.

Exceptions:

- `tools/local-extract/aklz4.py` comes from [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker) and keeps its BSD-3-Clause license (see `tools/local-extract/LICENSE-Ark-Unpacker.txt`).
- Third-party libraries installed through npm (PixiJS, pixi-spine, Preact, htm, three.js, ws, etc.) and fonts keep their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

**English translation credit**: the English UI strings in `public/i18n/en.json` and the supplementary game-text translations in `tools/i18n/fallback-pr70.json` are based on the translations by **@YuriRestia** in GitHub PR #70 (branch `en-translation`). By decision of the project owner (2026-10-05) they are used with credit and released with this project under GPL-3.0-or-later; the texts in PR #70 taken from ak-spa-database.pages.dev (no license stated) were not used. The English game texts in `data/i18n/en.json` are themselves official EN server data (see section 2).

**Asset preload credit**: "Settings ▸ Preload Assets" (`public/resource-sw.js`, `public/js/resources/`, `shared/resources.js`, `server/resources.js`) is based on the asset preload module of [xinhai-ai/Stronghold-Protocol](https://github.com/xinhai-ai/Stronghold-Protocol) (`public/resource-sw.js`, `public/js/resources/`, `server/resources.js`, GPL-3.0-or-later); copyright belongs to its contributors, and it is released with this project under GPL-3.0-or-later.
The asset preload (Settings ▸ Preload Assets) is based on the preloader of xinhai-ai/Stronghold-Protocol (GPL-3.0-or-later); copyright its contributors, distributed under the same license.

**Additional permission (GPL-3.0 section 7)** — Additional permission under GNU GPL version 3 section 7:

> If you modify this Program, or any covered work, by linking or combining it with the Spine Runtimes (as shipped in
> pixi-spine, or a modified version of them), containing parts covered by the terms of the Spine Runtimes License
> Agreement, the licensors of this Program grant you additional permission to convey the resulting work.
> Corresponding Source for a non-source form of such a combination shall include the source code for the parts of
> the Spine Runtimes used as well as that of the covered work.

(In short: you may redistribute this project combined with the Spine Runtimes in pixi-spine; the Spine Runtimes themselves remain subject to their own license.)

## 2. Content that does not belong to this project and is not covered by the GPL

All **names, characters, art, Spine models, UI images, music and sound effects, text and game data** related to *Arknights* and *Stronghold Protocol* are copyright of Shanghai Hypergryph Network Technology Co., Ltd. and its licensors (Yostar, etc.). Specifically this includes:

- `public/assets/**` in the full Release bundle (including the 3D board models and textures extracted locally from the official client, `public/assets/local/**`) and `public/fonts/**` (fonts belong to their respective authors);
- `data/*.json` and `data/i18n/*.json` (official EN server texts) generated from the official data tables, and `docs/research/*.json`, `test/fixtures/official-waves.json` and `public/dev/recordings/*.json`, which contain or are derived from game data;
- the game screenshots in `docs/img/`;
- text from community pages such as PRTS, BWIKI, NGA and Bahamut quoted in `docs/` (still under the license of their source; wiki text is CC BY-NC-SA).

This content is **not within the scope of the GPL-3.0 grant**, and this project has no right to grant anyone any rights to it.

## 3. Non-commercial use only

- This project is for **study, research and personal non-commercial entertainment** only.
- The rights holders of the game assets and data have not authorized this project or its users to make any commercial use of them. Therefore everything that contains or depends on these assets — the full Release bundle, servers you host, screenshots, recordings, live streams, etc. — **must not be used for profit in any form**. This includes but is not limited to:
  - selling or paid distribution;
  - charging for servers, paid rooms or memberships;
  - embedding ads;
  - tips, sponsorships or crowdfunding tied to this project;
  - packaging it into any paid product or service.
- When redistributing the full bundle, keep this notice, [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and likewise state that it is unofficial and non-commercial.
- The GPL itself permits commercial use of the **code**; the restrictions above apply to the game assets and data that do not belong to this project.

## 4. Notices from rights holders and removal

If you are a relevant rights holder and consider any content of this project inappropriate, please open an Issue in this repository (or contact the repository owner through GitHub). We will remove the content as soon as possible, or take down the full bundle or even the entire repository.

## 5. Disclaimer

- This project is provided "as is", **without any warranty, express or implied** (see sections 15 and 16 of the LICENSE).
- The risks of using, hosting or publishing this project — including network security, third-party networking tools and services, and local laws and regulations — are borne by the user.
- This project does not need and will never ask for any game account; the optional local extraction only reads client files already installed on your own machine.

---

**English summary.** Unofficial, non-commercial fan remake; not affiliated with or endorsed by Hypergryph or Yostar.
The project's own code is GPL-3.0-or-later (with the Spine Runtimes linking permission above). All Arknights names,
art, models, audio and data — including everything under `public/assets/` in the release bundle — are © Hypergryph /
Yostar and their licensors, are **not** covered by the GPL, and may be used for study and personal non-commercial
purposes only: no selling, paid distribution, paid hosting, ads, donations or any other monetisation. Rights holders
can request removal through a GitHub issue and the content will be taken down. No warranty of any kind.
The English UI strings were seeded from GitHub PR #70 by @YuriRestia (credited, released with the project under
GPL-3.0-or-later); the English game texts (`data/i18n/en.json`) are official EN client data like `data/*.json`.
The English names, skills, talents and modules of the operators the EN client does not have yet (可露希尔, 予愿安洁莉娜,
凯尔希·思衡托, 机械师, 维伊, 谬因, 珊比, 克莱门莎; in `tools/i18n/fallback-pr70.json`) follow the wording of arknights.wiki.gg
(https://arknights.wiki.gg/wiki/Operator/List#CN_Operators, CC BY-SA 4.0), with the remake's numbers. The wiki has no
English for the CN-only modules 好时节 ("A Fine Season", Shu, GUA-Y) and “前路” ("The Road Ahead", Ulpianus, CRU-Y), or
for the GUA-Y upgrade of Shu's 天有四时 ("From Seasons Fourfold") talent; those are this fork's own wording until the
EN client adds them.
