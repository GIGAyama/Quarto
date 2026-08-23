/*
 * 表示用の Web フォント（Zen Maru Gothic）を、起動を止めない形で足す。
 *
 * ⚠️ index.css の先頭に @import で書いてはいけない。
 *    @import は束ねた CSS（assets/main-*.css）の先頭にそのまま残り、
 *    その CSS は <head> の <link rel="stylesheet"> として配られる。
 *    ブラウザは「読み込み中のスタイルシートが 1枚でもある間」
 *    module script を実行しない。そのため fonts.googleapis.com が
 *    『拒否』ではなく『握ったまま返さない』塞がれ方（学校のフィルタでは
 *    こちらのほうが多い）をすると、React が永久に動き出さない。
 *    画面には index.html の「うまく ひらけませんでした」だけが残り、
 *    「もういちど ひらく」を押しても同じ壁に当たり続ける。
 *    これが 2026-08-23 の「アプリが開けない」の正体だった。
 *    ※ 拒否が即座に返るときは先へ進めるので、手元では再現しにくい。
 *      止まるかどうかは「塞がり方」で変わる、という点を忘れないこと。
 *
 * ⚠️ いったん media="print" で足すのが要点。
 *    今のメディアに合致しないスタイルシートは、描画も script も止めない。
 *    届いてから media を 'all' に戻し、そこではじめて字を差し替える。
 *
 * ⚠️ HTML に onload= と直に書く手は使えない。
 *    index.html の CSP は script-src 'self' なので、インラインの
 *    イベント属性は黙って無視される。JS 側で addEventListener する。
 *
 * ⚠️ 足すのは load が済んでから。
 *    読み込み中のスタイルシートが 1枚でもあると load は発火しない。
 *    先に足してしまうと、無応答のときに load が永久に来ず、
 *    それを待っている Service Worker の登録（src/pwa.js）も
 *    黙って行われないままになる＝オフラインで開けない端末ができる。
 *    字が入れ替わるのが一拍遅れるが、display=swap でどのみち一度は
 *    端末側の字で出るので、見え方はほとんど変わらない。
 *
 * 届かなくても、:root の --font-ui が端末側の丸ゴシックへ落ちるだけで、
 * アプリはふつうに遊べる（index.css のフォント指定を参照）。
 */
const HREF =
  'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap';

function append() {
  if (document.querySelector(`link[href="${HREF}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HREF;
  // 読み込みが終わるまでは「印刷用」扱いにして、起動を止めさせない
  link.media = 'print';
  link.addEventListener(
    'load',
    () => {
      link.media = 'all';
    },
    { once: true }
  );
  document.head.appendChild(link);
}

export function loadDisplayFont() {
  // load が済んでいるならその場で足す（src/pwa.js と同じ見分け方）
  if (document.readyState === 'complete') append();
  else window.addEventListener('load', append, { once: true });
}
