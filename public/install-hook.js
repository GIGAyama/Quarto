/*
 * インストールの合図を「いちばん先に」受け取るための小さなファイル。
 *
 * Chrome は条件が揃うと即座に beforeinstallprompt を出すため、
 * React や three.js の読み込みより後にリスナーを付けると合図を取りこぼし、
 * 通信が遅い端末で「インストール」ボタンが出なくなる。
 *
 * CSP に 'unsafe-inline' を足さずに済むよう、インラインではなく
 * 外部ファイルにして <head> の先頭で同期読み込みする。
 */
(function () {
  window.__pwaInstallPrompt = null;

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
