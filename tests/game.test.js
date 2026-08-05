/*
 * 中核ロジック（勝敗判定）のテスト。
 *
 *   npm test
 *
 * クアルトは「4つそろえば勝ち」だが、そろえる対象が4属性ある。
 * 「そろっていないのに勝ちになる」より「そろっているのに勝ちにならない」ほうが
 * 授業では困る（子どもが正しく並べたのに認めてもらえない）ので、両方を確かめる。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECES, PIECES_BY_ID, checkWin, createInitialGameState } from '../src/game.js';

const emptyBoard = () =>
  Array(4)
    .fill(null)
    .map(() => Array(4).fill(null));

const pick = (color, height, shape, hole) =>
  PIECES.find(
    (p) => p.color === color && p.height === height && p.shape === shape && p.hole === hole
  ).id;

// 「その属性だけがそろっている」4枚を確かめる。
// 単に「背の高いコマを4枚」と選ぶと色まで同じものが並んでしまい、
// 高さの判定を試したつもりが色の判定を試すことになる。
const onlyMatches = (ids, attr) => {
  for (const a of ['color', 'height', 'shape', 'hole']) {
    const vals = new Set(ids.map((id) => PIECES_BY_ID.get(id)[a]));
    if (a === attr) assert.equal(vals.size, 1, `${a} がそろっていない`);
    else assert.ok(vals.size > 1, `${a} まで4つそろってしまっている`);
  }
};

test('コマは16種類あり、4属性の全組み合わせが1つずつある', () => {
  assert.equal(PIECES.length, 16);
  const keys = new Set(PIECES.map((p) => `${p.color}/${p.height}/${p.shape}/${p.hole}`));
  assert.equal(keys.size, 16);
});

test('空の盤面では勝ちにならない', () => {
  assert.equal(checkWin(emptyBoard()).isWin, false);
});

test('初期状態は16個すべてが選べる状態になっている', () => {
  const s = createInitialGameState();
  assert.equal(s.availablePieces.length, 16);
  assert.equal(s.currentPhase, 'SELECT');
  assert.equal(s.gameOver, false);
});

test('横1列に「色だけ」が4つそろうと勝ち', () => {
  const ids = [
    pick('light', 'short', 'round', 'solid'),
    pick('light', 'tall', 'round', 'hollow'),
    pick('light', 'short', 'square', 'hollow'),
    pick('light', 'tall', 'square', 'solid')
  ];
  onlyMatches(ids, 'color');

  const board = emptyBoard();
  ids.forEach((id, c) => (board[1][c] = id));

  const r = checkWin(board);
  assert.equal(r.isWin, true);
  assert.equal(r.attr, 'color');
  assert.deepEqual(r.line, [
    { r: 1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: 2 },
    { r: 1, c: 3 }
  ]);
});

test('縦1列に「高さだけ」が4つそろうと勝ち', () => {
  const ids = [
    pick('light', 'tall', 'round', 'solid'),
    pick('dark', 'tall', 'round', 'hollow'),
    pick('light', 'tall', 'square', 'hollow'),
    pick('dark', 'tall', 'square', 'solid')
  ];
  onlyMatches(ids, 'height');

  const board = emptyBoard();
  ids.forEach((id, r) => (board[r][2] = id));

  const r = checkWin(board);
  assert.equal(r.isWin, true);
  assert.equal(r.attr, 'height');
});

test('斜め（左上→右下）に「形だけ」が4つそろうと勝ち', () => {
  const ids = [
    pick('light', 'short', 'round', 'solid'),
    pick('dark', 'tall', 'round', 'hollow'),
    pick('dark', 'short', 'round', 'hollow'),
    pick('light', 'tall', 'round', 'solid')
  ];
  onlyMatches(ids, 'shape');

  const board = emptyBoard();
  ids.forEach((id, i) => (board[i][i] = id));

  const r = checkWin(board);
  assert.equal(r.isWin, true);
  assert.equal(r.attr, 'shape');
});

test('斜め（右上→左下）に「穴だけ」が4つそろうと勝ち', () => {
  const ids = [
    pick('light', 'short', 'round', 'hollow'),
    pick('dark', 'tall', 'round', 'hollow'),
    pick('dark', 'short', 'square', 'hollow'),
    pick('light', 'tall', 'square', 'hollow')
  ];
  onlyMatches(ids, 'hole');

  const board = emptyBoard();
  ids.forEach((id, i) => (board[i][3 - i] = id));

  const r = checkWin(board);
  assert.equal(r.isWin, true);
  assert.equal(r.attr, 'hole');
});

test('4つそろっていても属性が1つも共通していなければ勝ちにならない', () => {
  // 色・高さ・形・穴 のどれも4つ一致しない組み合わせを作る
  const board = emptyBoard();
  const pick = (color, height, shape, hole) =>
    PIECES.find(
      (p) => p.color === color && p.height === height && p.shape === shape && p.hole === hole
    ).id;

  board[0][0] = pick('light', 'short', 'round', 'solid');
  board[0][1] = pick('dark', 'tall', 'round', 'hollow');
  board[0][2] = pick('light', 'tall', 'square', 'hollow');
  board[0][3] = pick('dark', 'short', 'square', 'solid');

  // 念のため、本当にどの属性も4つ一致していないことを確かめてからテストする
  for (const attr of ['color', 'height', 'shape', 'hole']) {
    const vals = new Set(board[0].map((id) => PIECES_BY_ID.get(id)[attr]));
    assert.ok(vals.size > 1, `${attr} が4つとも同じになってしまっている`);
  }

  assert.equal(checkWin(board).isWin, false);
});

test('3つしか並んでいなければ勝ちにならない', () => {
  const board = emptyBoard();
  [
    pick('dark', 'short', 'round', 'solid'),
    pick('dark', 'tall', 'round', 'hollow'),
    pick('dark', 'short', 'square', 'hollow')
  ].forEach((id, c) => (board[0][c] = id));

  assert.equal(checkWin(board).isWin, false);
});

test('盤面が埋まっていても、そろっていなければ勝ちにならない（引き分けの成立条件）', () => {
  // 16個すべてを並べて勝ちにならない配置を、決まった手順で探す。
  // 手で並べると気づかないうちにどこかの列がそろってしまう。
  let seed = 20260805; // 毎回同じ結果になるよう種を固定する
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  let found = null;
  for (let attempt = 0; attempt < 5000 && !found; attempt++) {
    const ids = PIECES.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const board = [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12), ids.slice(12, 16)];
    if (!checkWin(board).isWin) found = board;
  }

  assert.ok(found, '勝ちにならない全埋め配置が見つからなかった');
  assert.equal(found.flat().filter((v) => v !== null).length, 16);
  assert.equal(new Set(found.flat()).size, 16);
  assert.equal(checkWin(found).isWin, false);
});
