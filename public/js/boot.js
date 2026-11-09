// Static boot diagnostics: CSP allows external scripts, never inline event handlers.
// i18n-ignore-file: pre-module legacy-browser fallback, as public/index.html.
// The page's language before the app loads: index.html is served as English (js/ui/lang.js START_LANG); a ?lang= or a
// stored choice (localStorage sp.pref.lang, js/ui/lang.js initialLang) is set here at once, so a browser's translate
// offer reads the language the page will show. js/ui/lang.js sets the final one as it boots.
window.__spLang = (function () {
  var code = null;
  try { var m = /[?&]lang=([^&#]*)/.exec(location.search); if (m) code = decodeURIComponent(m[1]); } catch (_x) { code = null; }
  if (!code) { try { code = JSON.parse(localStorage.getItem('sp.pref.lang')); } catch (_y) { code = null; } }
  if (typeof code !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) return 'en';
  var lang = /^zh(-cn|-hans)?$/i.test(code) ? 'zh-CN' : code;
  try { document.documentElement.lang = lang; } catch (_z) { /* ignore */ }
  return lang;
})();
var spZh = /^zh-CN$/.test(window.__spLang);
// Boot diagnostics (plain ES5: runs everywhere). A browser too old for the app says so instead of spinning forever:
    // no ES modules (nomodule below), a module graph that cannot load (e.g. import maps: Safari / iOS < 16.4), or no
    // boot after 9 s.
    window.__spBootFail = function (why) {
      var e = document.getElementById('boot-err');
      if (!e || e.getAttribute('data-final')) return;
      var im;
      try { im = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')); } catch (_x) { im = false; }
      e.textContent = why === 'old' || !im
        ? (spZh ? '当前浏览器版本过旧，无法运行本游戏。请升级到 iOS / iPadOS 16.4+（Safari 16.4+）、Chrome / Edge 90+ 或 Firefox 108+ 后刷新。'
          : 'This browser is too old to run the game. Update to iOS / iPadOS 16.4+ (Safari 16.4+), Chrome / Edge 90+ or Firefox 108+, then reload.')
        : (spZh ? '游戏脚本加载失败，请检查网络连接后刷新页面。' : 'The game scripts failed to load. Check your connection, then reload the page.');
      e.setAttribute('data-final', '1');
    };
    // a module graph that fails to link (bare specifier without import-map support) reports here, not on the <script>
    window.addEventListener('error', function (ev) {
      var b = document.getElementById('boot');
      if (!b || b.classList.contains('is-done')) return;
      if (/specifier|resolve|import|module/i.test(String(ev && ev.message))) window.__spBootFail('load');
    });
  
// If modules never boot (very old browser / blocked script), explain instead of spinning forever.
    setTimeout(function () {
      var b = document.getElementById('boot'), e = document.getElementById('boot-err');
      if (b && !b.classList.contains('is-done') && e && !e.textContent) e.textContent = spZh ? '加载时间较长…如长时间无响应，请使用最新版 Chrome / Edge / Safari / Firefox 并刷新页面。'
        : 'Loading is taking a while… If nothing happens, use the latest Chrome / Edge / Safari / Firefox and reload.';
    }, 9000);
  
document.addEventListener('error', function (event) {
  if (event.target && event.target.id === 'sp-main') window.__spBootFail('load');
}, true);
