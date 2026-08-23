/*
 * 「WebGL は使えるのに、頼んだオプションだけ断られて開けない」の再発よけ。
 *
 *   npm test
 *
 * 端末は「WebGL が使えるか」と「そのオプションで使えるか」を別々に答える。
 * three.js の例外もそこを区別していて、
 *   Error creating WebGL context with your selected attributes.
 * は「WebGL は使えるが、頼んだオプションが通らない」という意味である。
 *
 * ⚠️ この形で落ちると、canUseWebGL() は素の判定なので true を返す。
 *    結果、利用者に出るのは 🖥️「3D が つかえません」ではなく
 *    🧩「うまく ひらけませんでした」になり、原因が読み取れない。
 *    2026-08-23 に Android で実際に起きた。
 *
 * ⚠️ 手元の PC では再現しない。断るかどうかは端末の GPU とドライバ次第で、
 *    開発機はまず断らないため、動作確認では見つけられない。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const app = read('../src/App.jsx');

test('WebGLRenderer を、注文を決め打ちにして直接作っていない', () => {
  // new THREE.WebGLRenderer({...}) が createRenderer() の外に出ていないこと。
  // 決め打ちに戻すと、断る端末で一段も下りられなくなる。
  const direct = app.match(/new THREE\.WebGLRenderer\(/g) || [];
  assert.equal(direct.length, 1, 'WebGLRenderer を作る場所は createRenderer() の1か所だけ');
  assert.match(app, /function createRenderer\(\)/);
  assert.match(app, /this\.renderer = createRenderer\(\)/);
});

test('断られたときに下りる段が用意してある', () => {
  const block = app.slice(app.indexOf('const RENDERER_OPTIONS'), app.indexOf('function createRenderer'));
  assert.ok(block, 'RENDERER_OPTIONS がある');

  const steps = block.split('\n').filter((l) => l.trim().startsWith('{ antialias'));
  assert.ok(steps.length >= 3, `下りる段が足りない（${steps.length}段）`);

  // 1段目だけが high-performance を頼む。2段目以降は GPU の選り好みをやめる
  assert.match(steps[0], /powerPreference/);
  assert.ok(
    steps.slice(1).every((l) => !l.includes('powerPreference')),
    '2段目以降で powerPreference を外していない'
  );
  // どこかで antialias を諦める段がある
  assert.ok(steps.some((l) => /antialias:\s*false/.test(l)), 'antialias を諦める段が無い');
});

test('createRenderer は全滅したときに最後の例外を投げ返す', () => {
  const fn = app.slice(app.indexOf('function createRenderer'), app.indexOf('// 1. Sound Manager'));
  assert.match(fn, /lastError/);
  assert.match(fn, /throw lastError/, '握りつぶすと原因が画面に出せなくなる');
});

test('canUseWebGL は、確かめただけの context を手放す', () => {
  const fn = app.slice(app.indexOf('function canUseWebGL'), app.indexOf('RENDERER_OPTIONS'));
  assert.match(fn, /WEBGL_lose_context/, '放っておくと端末の WebGL 枠を1つ食いつぶす');
});

test('失敗の事情が画面に出る（3D の用意に失敗したとき）', () => {
  assert.match(app, /detail:/, '例外の中身を画面へ渡していない');
  assert.match(app, /<ErrorScreen kind=\{initError\.kind\} detail=\{initError\.detail\}/);
  assert.match(read('../src/ErrorScreen.jsx'), /detail = ''/, 'ErrorScreen が detail を受け取っていない');
});

/*
 * 本体が一度も動かないまま止まった場合の手がかり。
 * ここが空だと、届く報せが「エラー画面が出る」だけになる。
 */
test('起動そのものが止まったときも、事情が待避画面に出る', () => {
  const hook = read('../public/install-hook.js');
  // 資産の読み込み失敗は window まで泡立たない。捕捉フェーズで受ける必要がある
  assert.match(hook, /addEventListener\(\s*'error',[\s\S]*?true\s*\)/, '捕捉フェーズで受けていない');
  assert.match(hook, /unhandledrejection/);
  assert.match(hook, /boot-detail/, '待避画面の置き場へ書いていない');
  assert.match(read('../index.html'), /id="boot-detail"/, '待避画面に置き場が無い');
});
