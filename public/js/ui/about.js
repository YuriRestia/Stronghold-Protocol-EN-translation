// "About this server" (title screen, under the login panel): contact, source, the deployed branch / commit and the
// copyright notice of a server running Fish Edition; and the footer's version line with its "What's new" panel (the
// latest commits, GitHub #98 / #99), and the links that open a new GitHub issue with its form and version filled in
// (#100; here and in 设置 → 问题反馈). Contact goes through the repository's issues, never a personal address. These
// are the fork's own texts, not game strings, so they live here, one block per supported language (English when a
// language has none), not in the language packs.
// The branch / commit / changes come from public/server-info.json, written by server/serverInfo.js at each start, and
// fetched once per page.
// (i18n-ignore-file: this fork's own notice, translated in TEXT below, not through the packs)

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { APP_VERSION } from '../../../shared/constants.js';
import { html, Button, Modal, MicroLabel } from './components.js';
import { useLang } from './lang.js';

export const REPO = 'https://github.com/evenifyouforget/Stronghold-Protocol-EN';
export const ISSUES_URL = `${REPO}/issues`;
const TRANSLATION = 'https://github.com/YuriRestia/Stronghold-Protocol-EN-translation';
const UPSTREAM = 'https://github.com/sganggs/Stronghold-Protocol';
const EDITION = 'Fish Edition';

/**
 * The texts per language. `{upstream}`, `{translation}`, `{notice}` and `{issues}` become links (see `fill`).
 * Keys: button, title, contact, openIssue, bug, feature, source, running, loading, unknown, close, intro, and
 * [heading, body] pairs in `sections`; whatsNew (the version line's tooltip and the panel's title), noChanges,
 * allCommits.
 */
const TEXT = {
  en: {
    button: 'About this server', title: 'About this server',
    contact: 'Contact', openIssue: 'Open an issue on GitHub', bug: 'Report a bug', feature: 'Suggest a feature',
    source: 'Source', running: 'Running', loading: 'loading…', unknown: 'unknown', close: 'Close',
    whatsNew: "What's new", noChanges: 'The change list is not available on this server.', allCommits: 'All commits',
    intro: 'Stronghold Protocol is a fan remake of the Arknights limited-time mode "Stronghold Protocol: Alliance". This server runs Fish Edition, a fork of {translation}, which is itself a fork of {upstream}; the original authors and the translator do not operate or maintain it. To reach the people behind Fish Edition, open an issue at {issues}.',
    sections: [
      ['Copyright', 'Arknights and all related names, characters, artwork, Spine models, music, sound effects, text and game data are © Hypergryph / Yostar and their licensors. They are used here for non-commercial fan purposes only and are not covered by this project\'s license. The project\'s own source code is released under GPL-3.0-or-later; full details are in {notice}.'],
      ['Non-commercial', 'This is a free, unofficial fan remake for study, research and non-commercial entertainment only, and it is not affiliated with Hypergryph, Yostar or their affiliates. It has no ads, paid features, donations, sponsorships or monetization of any kind, and it never will.'],
      ['Rights holders', 'If you hold rights to any content shown here and want it removed, open an issue at {issues}. It will be taken down promptly, or the service stopped if needed.'],
      ['No warranty', 'This server is provided "as is", without warranty of any kind. It never asks for your game account. We do not collect or keep hold of any user personal information.'],
    ],
  },
  zh: {
    button: '关于本服务器', title: '关于本服务器',
    contact: '联系方式', openIssue: '在 GitHub 上提交 issue', bug: '反馈 Bug', feature: '提出功能建议',
    source: '源代码', running: '运行版本', loading: '加载中…', unknown: '未知', close: '关闭',
    whatsNew: '更新内容', noChanges: '本服务器没有提供更新列表。', allCommits: '全部提交',
    intro: '卫戍协议是《明日方舟》限时玩法「卫戍协议：盟约」的同人复刻。本服务器运行的是 Fish Edition：它是 {translation} 的分支（fork），而后者又是 {upstream} 的分支；原作者与译者都不参与本服务器的运营或维护。如需联系 Fish Edition 的维护者，请在 {issues} 提交 issue。',
    sections: [
      ['版权', '《明日方舟》及其相关的全部名称、角色、美术、Spine 模型、音乐音效、文本与游戏数据，版权归上海鹰角网络（Hypergryph）、Yostar 及其授权方所有。本服务器仅以非商业的同人用途使用这些内容，它们不在本项目的许可证范围内。本项目自己编写的源代码以 GPL-3.0-or-later 发布，详见 {notice}。'],
      ['非商业', '本项目是免费、非官方的同人复刻，仅供学习、研究和非商业娱乐，与上海鹰角网络、Yostar 及其关联方没有任何关联。本服务器没有广告、付费功能、捐赠、赞助或任何形式的盈利，今后也不会有。'],
      ['权利人', '如果你是本站所展示内容的权利人并希望删除相关内容，请在 {issues} 提交 issue。我们会尽快删除，必要时停止本服务。'],
      ['免责声明', '本服务器按「原样」提供，不附带任何形式的担保。本服务器不会索取你的游戏账号。我们不会收集或保留任何用户个人信息。'],
    ],
  },
  'zh-TW': {
    button: '關於本伺服器', title: '關於本伺服器',
    contact: '聯絡方式', openIssue: '在 GitHub 上提交 issue', bug: '回報 Bug', feature: '提出功能建議',
    source: '原始碼', running: '執行版本', loading: '載入中…', unknown: '未知', close: '關閉',
    whatsNew: '更新內容', noChanges: '本伺服器沒有提供更新列表。', allCommits: '全部提交',
    intro: '衛戍協議是《明日方舟》限時玩法「衛戍協議：盟約」的同人復刻。本伺服器執行的是 Fish Edition：它是 {translation} 的分支（fork），而後者又是 {upstream} 的分支；原作者與譯者都不參與本伺服器的營運或維護。如需聯絡 Fish Edition 的維護者，請在 {issues} 提交 issue。',
    sections: [
      ['版權', '《明日方舟》及其相關的全部名稱、角色、美術、Spine 模型、音樂音效、文字與遊戲資料，版權歸上海鷹角網絡（Hypergryph）、Yostar 及其授權方所有。本伺服器僅以非商業的同人用途使用這些內容，它們不在本專案的授權條款範圍內。本專案自行撰寫的原始碼以 GPL-3.0-or-later 發布，詳見 {notice}。'],
      ['非商業', '本專案是免費、非官方的同人復刻，僅供學習、研究和非商業娛樂，與上海鷹角網絡、Yostar 及其關係企業沒有任何關聯。本伺服器沒有廣告、付費功能、捐款、贊助或任何形式的營利，今後也不會有。'],
      ['權利人', '如果你是本站所展示內容的權利人並希望刪除相關內容，請在 {issues} 提交 issue。我們會盡快刪除，必要時停止本服務。'],
      ['免責聲明', '本伺服器按「現狀」提供，不附帶任何形式的擔保。本伺服器不會索取你的遊戲帳號。我們不會蒐集或保留任何使用者個人資料。'],
    ],
  },
  ja: {
    button: 'このサーバーについて', title: 'このサーバーについて',
    contact: '連絡先', openIssue: 'GitHub で issue を作成', bug: 'バグを報告', feature: '機能を提案',
    source: 'ソースコード', running: '稼働中のバージョン', loading: '読み込み中…', unknown: '不明', close: '閉じる',
    whatsNew: '更新内容', noChanges: 'このサーバーでは更新一覧を表示できません。', allCommits: 'すべてのコミット',
    intro: '堅守協定は『アークナイツ』の期間限定モード「堅守協定：盟約」のファンリメイクです。このサーバーで動いているのは Fish Edition で、{translation} のフォークです（そちらも {upstream} のフォークです）。オリジナルの作者と翻訳者はこのサーバーの運営・保守に関わっていません。Fish Edition の開発者への連絡は、{issues} で issue を作成してください。',
    sections: [
      ['著作権', '『アークナイツ』および関連するすべての名称、キャラクター、アートワーク、Spine モデル、音楽、効果音、テキスト、ゲームデータの権利は Hypergryph / Yostar およびそのライセンサーに帰属します。これらは非営利のファン活動の目的でのみ使用しており、本プロジェクトのライセンスの対象外です。本プロジェクト独自のソースコードは GPL-3.0-or-later で公開しています。詳細は {notice} をご覧ください。'],
      ['非営利', '本プロジェクトは学習・研究・非営利の娯楽のみを目的とした無料の非公式ファンリメイクであり、Hypergryph、Yostar およびその関連会社とは一切関係ありません。広告、有料機能、寄付、スポンサー、その他いかなる収益化も行っておらず、今後も行いません。'],
      ['権利者の方へ', 'このサイトに表示されているコンテンツの権利者の方で削除をご希望の場合は、{issues} で issue を作成してください。速やかに削除し、必要に応じてサービスを停止します。'],
      ['免責事項', 'このサーバーは「現状のまま」提供され、いかなる保証もありません。ゲームアカウントを求めることはありません。ユーザーの個人情報を収集・保持することもありません。'],
    ],
  },
  ko: {
    button: '이 서버 정보', title: '이 서버 정보',
    contact: '연락처', openIssue: 'GitHub에서 이슈 작성', bug: '버그 제보', feature: '기능 제안',
    source: '소스 코드', running: '실행 중인 버전', loading: '불러오는 중…', unknown: '알 수 없음', close: '닫기',
    whatsNew: '업데이트 내용', noChanges: '이 서버에서는 변경 목록을 볼 수 없습니다.', allCommits: '전체 커밋',
    intro: '위수 협의는 『명일방주』의 기간 한정 모드 「위수 협의: 맹약」의 팬 리메이크입니다. 이 서버는 Fish Edition을 실행합니다. Fish Edition은 {translation}의 포크이며, 그것은 다시 {upstream}의 포크입니다. 원작자와 번역자는 이 서버의 운영이나 유지 보수에 관여하지 않습니다. Fish Edition 개발자에게 연락하려면 {issues}에 이슈를 작성해 주세요.',
    sections: [
      ['저작권', '『명일방주』 및 관련된 모든 명칭, 캐릭터, 아트워크, Spine 모델, 음악, 효과음, 텍스트, 게임 데이터의 권리는 Hypergryph / Yostar 및 그 라이선서에게 있습니다. 이 콘텐츠는 비상업적인 팬 활동 목적으로만 사용되며 이 프로젝트의 라이선스 적용 대상이 아닙니다. 이 프로젝트가 직접 작성한 소스 코드는 GPL-3.0-or-later로 공개됩니다. 자세한 내용은 {notice}를 참고하세요.'],
      ['비상업적 이용', '이 프로젝트는 학습, 연구, 비상업적 오락만을 위한 무료 비공식 팬 리메이크이며 Hypergryph, Yostar 및 그 계열사와 아무런 관련이 없습니다. 광고, 유료 기능, 기부, 후원 등 어떠한 형태의 수익 창출도 하지 않으며 앞으로도 하지 않습니다.'],
      ['권리자 안내', '이 사이트에 표시된 콘텐츠의 권리자로서 삭제를 원하시면 {issues}에 이슈를 작성해 주세요. 신속히 삭제하고, 필요한 경우 서비스를 중단하겠습니다.'],
      ['면책 조항', '이 서버는 "있는 그대로" 제공되며 어떠한 보증도 하지 않습니다. 게임 계정을 요구하지 않습니다. 사용자의 개인 정보를 수집하거나 보관하지 않습니다.'],
    ],
  },
};

const ext = (href, text) => html`<a href=${href} target="_blank" rel="noopener noreferrer">${text}</a>`;

const LINKS = {
  upstream: () => ext(UPSTREAM, 'sganggs/Stronghold-Protocol'),
  translation: () => ext(TRANSLATION, 'YuriRestia/Stronghold-Protocol-EN-translation'),
  notice: () => ext(`${REPO}/blob/main/NOTICE.md`, 'NOTICE.md'),
  issues: () => ext(ISSUES_URL, 'evenifyouforget/Stronghold-Protocol-EN/issues'),
};

/** A text with its `{name}` placeholders replaced by the LINKS. */
const fill = (s) => s.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? (LINKS[part] ? LINKS[part]() : `{${part}}`) : part));

let infoLoad = null;
/**
 * public/server-info.json, fetched once per page: null while loading, false when the server has none.
 * @returns {null | false | { branch: string, commit: string, date: string, changes?: { commit: string, date: string, subject: string }[] }}
 */
export function useServerInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let live = true;
    infoLoad ??= fetch('/server-info.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : false))
      .catch(() => false);
    infoLoad.then((v) => { if (live) setInfo(v); });
    return () => { live = false; };
  }, []);
  return info;
}

/** The version a report names: `0.3.1 Fish Edition (abc1234)`, without the commit when the server does not say. */
export const versionText = (info) => `${APP_VERSION} ${EDITION}${info?.commit ? ` (${info.commit.slice(0, 7)})` : ''}`;

/**
 * GitHub's new-issue page with the bug report or feature request form open (the Chinese forms for zh / zh-TW, the
 * English ones otherwise) and its Version field filled in (the forms' field id `version`, .github/ISSUE_TEMPLATE/).
 * @param {'bug' | 'feature'} kind @param {string} lang @param {*} info server-info.json, or null / false
 */
export function newIssueUrl(kind, lang, info) {
  const form = `${kind === 'bug' ? 'BugReport' : 'FeatureRequest'}${lang === 'zh' || lang === 'zh-TW' ? '' : '.en'}.yml`;
  return `${ISSUES_URL}/new?template=${form}&version=${encodeURIComponent(versionText(info))}`;
}

/** "Report a bug · Suggest a feature": new issues on GitHub, the version filled in. */
export function IssueLinks({ class: cls }) {
  const lang = useLang();
  const tx = TEXT[lang] || TEXT.en;
  const info = useServerInfo();
  return html`<span class=${['issue-links', cls].filter(Boolean).join(' ')}>
    <a href=${newIssueUrl('bug', lang, info)} target="_blank" rel="noopener noreferrer" data-testid="issue-bug">${tx.bug}</a>
    <span aria-hidden="true">·</span>
    <a href=${newIssueUrl('feature', lang, info)} target="_blank" rel="noopener noreferrer" data-testid="issue-feature">${tx.feature}</a>
  </span>`;
}

/** The deployed build line: `branch @ commit`, each a link; "unknown" without server-info.json. */
function Build({ info, tx }) {
  if (info === null) return html`<span>${tx.loading}</span>`;
  if (!info?.commit) return html`<span>${tx.unknown}</span>`;
  const short = info.commit.slice(0, 7);
  return html`<span>${ext(`${REPO}/tree/${encodeURIComponent(info.branch)}`, info.branch)} @ ${ext(`${REPO}/commit/${info.commit}`, html`<code>${short}</code>`)}
    ${info.date ? html` <span class="about__dim">(${info.date.slice(0, 10)})</span>` : null}</span>`;
}

function AboutModal({ open, onClose, tx }) {
  const info = useServerInfo();
  return html`<${Modal} open=${open} onClose=${onClose} title=${tx.title} micro="SERVER INFO" width="7.6rem" class="about"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>${tx.close}<//>`}>
    <dl class="about__facts">
      <dt>${tx.contact}</dt><dd>${ext(ISSUES_URL, tx.openIssue)} <span class="about__dim">(<${IssueLinks} />)</span></dd>
      <dt>${tx.source}</dt><dd>${ext(REPO, 'evenifyouforget/Stronghold-Protocol-EN')}</dd>
      <dt>${tx.running}</dt><dd><${Build} info=${info} tx=${tx} /></dd>
    </dl>
    <p>${fill(tx.intro)}</p>
    ${tx.sections.map(([head, body]) => html`<h3>${head}</h3><p>${fill(body)}</p>`)}
  <//>`;
}

/** The small "About this server" text button and its panel, in the current language. */
export function AboutServerButton() {
  const lang = useLang();
  const tx = TEXT[lang] || TEXT.en;
  const [open, setOpen] = useState(false);
  return html`<div class="title-about">
    <${Button} variant="ghost" size="sm" icon="info" class="title-about__btn" onClick=${() => setOpen(true)}>${tx.button}<//>
    <${AboutModal} open=${open} onClose=${() => setOpen(false)} tx=${tx} />
  </div>`;
}

/**
 * A commit subject with its pull request linked: the `(#N)` GitHub appends when it merges one. Other numbers stay text,
 * since a subject may name another repository's (e.g. "Yuri #17").
 */
export function linkRefs(subject) {
  const m = /^(.*\()#(\d+)\)$/s.exec(subject);
  return m ? [m[1], ext(`${REPO}/pull/${m[2]}`, `#${m[2]}`), ')'] : [subject];
}

/** "What's new": the latest commits of the running branch (server-info.json `changes`), newest first. */
function WhatsNewModal({ open, onClose, tx, info }) {
  const changes = info?.changes || [];
  return html`<${Modal} open=${open} onClose=${onClose} title=${tx.whatsNew} micro=${`v${APP_VERSION} · ${EDITION.toUpperCase()}`} width="7.6rem" class="about whats-new"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>${tx.close}<//>`}>
    <p>${tx.running}: <${Build} info=${info} tx=${tx} /></p>
    ${info === null ? html`<p>${tx.loading}</p>`
      : changes.length ? html`<ul class="whats-new__list" data-testid="whats-new-list">
        ${changes.map((c) => html`<li key=${c.commit}>
          <span class="about__dim num">${c.date.slice(0, 10)}</span>
          <span class="whats-new__subject">${linkRefs(c.subject)}</span>
          ${ext(`${REPO}/commit/${c.commit}`, html`<code>${c.commit.slice(0, 7)}</code>`)}
        </li>`)}
      </ul>
      <p>${ext(`${REPO}/commits/${encodeURIComponent(info.branch)}`, tx.allCommits)}</p>`
      : html`<p class="about__dim">${tx.noChanges}</p>`}
    <p><${IssueLinks} /></p>
  <//>`;
}

/**
 * The footer's version line, `v0.3.1 · FISH EDITION · abc1234` (the commit once server-info.json says it), a button
 * that opens "What's new".
 */
export function VersionButton() {
  const lang = useLang();
  const tx = TEXT[lang] || TEXT.en;
  const info = useServerInfo();
  const [open, setOpen] = useState(false);
  return html`<button type="button" class="title-version" title=${tx.whatsNew} data-testid="title-version" onClick=${() => setOpen(true)}>
      <${MicroLabel}>v${APP_VERSION} · ${EDITION.toUpperCase()}${info?.commit ? ` · ${info.commit.slice(0, 7)}` : ''}<//>
    </button>
    <${WhatsNewModal} open=${open} onClose=${() => setOpen(false)} tx=${tx} info=${info} />`;
}
