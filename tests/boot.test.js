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
import { readFileSync, readdirSync } from 'node:fs';
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

/*
 * ⚠️ ここには以前、src/font.js（media="print" で足して load 後に差し替える
 *    40 行の回避策）を見張るテストが 2 件あった。書体を自分のところから
 *    配るようになり、回避する相手そのものが消えたので font.js ごと削除した。
 *    見張る対象を「回避策が正しいか」から「そもそも外へ出ていないか」に
 *    差し替える。こちらのほうが強い条件になる。
 */

test('書体は自分のところから配る（生成した fonts.css に外部が無い）', () => {
  const css = read('../src/fonts.css');
  assert.match(css, /@font-face/, '@font-face が無い（生成し直していない？）');
  assert.match(css, /url\('\/fonts\//, '自分のところの woff2 を指していない');
  assert.equal(
    /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(css),
    false,
    '生成物に外部への参照が残っている',
  );
});

test('src/ のどこからも、実行時に Google Fonts を読んでいない', () => {
  // 回避策を消したあとで、うっかり戻すのを止める見張り。
  const dir = fileURLToPath(new URL('../src', import.meta.url));
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`],
    );
  const offenders = walk(dir)
    .filter((f) => /\.(js|jsx|css)$/.test(f))
    .filter((f) => {
      const body = readFileSync(f, 'utf8')
        // 経緯を書いたコメントは対象外。見るのは実際に読みにいく行だけ
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      return /fonts\.(googleapis|gstatic)\.com/.test(body);
    });
  assert.deepEqual(offenders, [], '実行時に Google Fonts を読んでいるファイルがある');
});

test('index.html が外部のスタイルシートを直に読み込んでいない', () => {
  const html = read('../index.html');
  const blocking = /<link[^>]+rel=["']stylesheet["'][^>]*https?:\/\//i.test(html);
  assert.equal(blocking, false, '<head> の外部スタイルシートは起動を止める');
});
