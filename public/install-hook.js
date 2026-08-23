/*
 * <head> のいちばん先で走る小さなファイル。2つの役目がある。
 *
 * ① インストールの合図を「いちばん先に」受け取る。
 *    Chrome は条件が揃うと即座に beforeinstallprompt を出すため、
 *    React や three.js の読み込みより後にリスナーを付けると合図を取りこぼし、
 *    通信が遅い端末で「インストール」ボタンが出なくなる。
 *
 * ② 起動できなかったときの事情を控えておく。
 *    本体（src/*）が一度も動かないまま止まると、画面には index.html の
 *    待避画面「うまく ひらけませんでした」だけが残り、原因の手がかりが
 *    1つも無い。配付されたタブレットでは開発者ツールも開けないため、
 *    利用者から届く報せが「エラー画面が出る」だけになり、切り分けに
 *    何往復もかかる（2026-08-23 に実際にそうなった）。
 *    ここは本体より先に走る唯一の場所なので、ここで拾っておく。
 *
 * CSP に 'unsafe-inline' を足さずに済むよう、インラインではなく
 * 外部ファイルにして <head> の先頭で同期読み込みする。
 */
(function () {
  window.__pwaInstallPrompt = null;

  // ── ② 起動できなかったときの事情 ──────────────────────────
  var bootErrors = [];
  window.__bootErrors = bootErrors;

  function note(text) {
    if (!text) return;
    text = String(text);
    if (bootErrors.indexOf(text) === -1) bootErrors.push(text);
  }

  // 読み込みに失敗した <script> や <link> は window まで泡立たないので、
  // 捕捉フェーズ（第3引数 true）で受ける。ここを false にすると何も拾えない。
  window.addEventListener(
    'error',
    function (e) {
      var el = e.target;
      if (el && el !== window && (el.src || el.href)) note('よみこめない: ' + (el.src || el.href));
      else note(e.message);
    },
    true
  );

  window.addEventListener('unhandledrejection', function (e) {
    note(e.reason && e.reason.message ? e.reason.message : e.reason);
  });

  // 待避画面が出るころ（index.html の animation-delay と同じ 12秒）に書き足す。
  // 本体が立ち上がっていれば React が #root を空にしているので、置き場が
  // 見つからず何もしない。つまり成功したときは邪魔をしない。
  setTimeout(function () {
    var slot = document.getElementById('boot-detail');
    if (!slot) return;
    slot.textContent = bootErrors.length
      ? bootErrors.slice(0, 4).join(' / ')
      : 'よみこみが おわりません（つうしんが とちゅうで とまっています）';
  }, 12000);

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-install-available'));
  });

  window.addEventListener('appinstalled', function () {
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
})();
