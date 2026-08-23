/*
 * 「エラー画面から抜け出せない」の再発よけ。
 *
 *   npm test
 *
 * エラー画面の「データを けして ひらきなおす」は、児童・先生に残された
 * 最後の復帰手段である。ここが黙って空振りすると、押しても押しても
 * 同じ画面が出続け、外からは「アプリが壊れて開けない」としか見えない。
 * 空振りは画面上に何の痕跡も残さないので、テストで押さえる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsScope } from '../src/app-cache.js';

// vite.config.js の base は './'。BASE_URL もその値で配られる。
const BASE_URL = './';

test('独自ドメイン直下では、自分の Service Worker を「自分のぶん」と見分ける', () => {
  const page = 'https://quarto.giga-school.com/index.html';
  assert.equal(ownsScope('https://quarto.giga-school.com/', BASE_URL, page), true);
});

test('BASE_URL が相対の "./" でも空振りしない（この取りこぼしが不具合だった）', () => {
  // 直す前は new URL(scope).pathname === '/' を './' と比べており、
  // '/'.startsWith('./') が必ず false になって 1つも消せなかった。
  const page = 'https://quarto.giga-school.com/';
  assert.notEqual('/'.startsWith(BASE_URL), true, '前提：素朴な比較は必ず外れる');
  assert.equal(ownsScope('https://quarto.giga-school.com/', BASE_URL, page), true);
});

test('入口が index.html でも "/" でも、同じ結果になる', () => {
  const scope = 'https://quarto.giga-school.com/';
  for (const page of [
    'https://quarto.giga-school.com/',
    'https://quarto.giga-school.com/index.html'
  ]) {
    assert.equal(ownsScope(scope, BASE_URL, page), true, page);
  }
});

/*
 * 旧配信元 gigayama.github.io のような共有オリジンに戻したときの約束。
 * ここを緩めると、同居する他のアプリの Service Worker まで解除してしまい、
 * 関係のないアプリがオフラインで起動しなくなる。
 */
test('共有オリジンでは、同居する他アプリの scope を巻き込まない', () => {
  const page = 'https://gigayama.github.io/Quarto/index.html';
  assert.equal(ownsScope('https://gigayama.github.io/Quarto/', BASE_URL, page), true);
  assert.equal(ownsScope('https://gigayama.github.io/Othello/', BASE_URL, page), false);
  assert.equal(ownsScope('https://gigayama.github.io/', BASE_URL, page), false);
});
