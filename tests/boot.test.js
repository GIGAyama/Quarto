/*
 * 「起動そのものが外部の通信に人質に取られていないか」の見張り。
 *
 *   npm test
 *
 * 束ねた CSS（assets/main-*.css）は <head> の <link rel="stylesheet"> として
 * 配られる。ブラウザは読み込み中のスタイルシートが 1枚でもある間、
 * module script を実行しない。つまり CSS の先頭に外部への @import が 1行あると、
 * その相手が「拒否」ではなく「握ったまま返さない」塞がれ方をしたとき、
 * React が永久に動き出さず、アプリは起動しない。
 *
 * ⚠️ 手元では再現しにくい。塞がれ方が「即座に拒否」なら先へ進めてしまうため、
 *    動作確認では気づけないまま、フィルタの効いた学校でだけ開けなくなる。
 *    だから目で見て確かめるのではなく、ここで機械に見張らせる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('index.css に、外部を指す @import がない', () => {
  const css = read('../src/index.css');
  // コメントの中の説明文まで拾わないよう、行頭の @import だけを見る
  const imports = css
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@import'));

  const remote = imports.filter((line) => /https?:|\/\//.test(line));
  assert.deepEqual(
    remote,
    [],
    '外部への @import は起動を止める。src/font.js のように load 後に足すこと'
  );
});

test('Web フォントは、起動を止めない足し方（media=print → all）で読み込む', () => {
  const js = read('../src/font.js');
  assert.match(js, /fonts\.googleapis\.com/, 'フォントの読み込み先がここにある');
  assert.match(js, /media\s*=\s*'print'/, '届くまでは印刷用あつかいにして描画も script も止めない');
  assert.match(js, /media\s*=\s*'all'/, '届いてから適用する');
});

test('フォントの読み込みは load のあと（Service Worker の登録を止めない）', () => {
  const js = read('../src/font.js');
  // 読み込み中のスタイルシートがあると load は発火しない。
  // 先に足すと、無応答のときに load が来ず、それを待っている
  // src/pwa.js の Service Worker 登録が黙って行われないままになる。
  assert.match(js, /readyState === 'complete'/);
  assert.match(js, /addEventListener\('load'/);
});

test('index.html が外部のスタイルシートを直に読み込んでいない', () => {
  const html = read('../index.html');
  const blocking = /<link[^>]+rel=["']stylesheet["'][^>]*https?:\/\//i.test(html);
  assert.equal(blocking, false, '<head> の外部スタイルシートは起動を止める');
});
